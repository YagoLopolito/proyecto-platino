import "server-only";
import { pickIgdbGame, secondsToMinutes, type IgdbGameCandidate } from "./match";

/**
 * Cliente de IGDB, la única fuente que publica los dos tiempos que pide la
 * ficha: historia principal y 100%.
 *
 * **Por qué IGDB y no HowLongToBeat**: HLTB no tiene API pública. Lo que se
 * usa por ahí es su endpoint interno de búsqueda, que exige un hash extraído
 * del bundle JS del sitio y cambia en cada release -- el mismo problema que el
 * GraphQL de la PS App, más un ToS que no permite scrapearlo. IGDB es de
 * Twitch/Amazon, tiene API oficial documentada, es gratis y su
 * `game_time_to_beat` es exactamente el dato ("hastily" / "normally" /
 * "completely", agregados de la comunidad).
 *
 * Toda llamada a IGDB vive acá, misma regla de aislamiento que `lib/psn/`,
 * `lib/steam/` y `lib/ai/`.
 */

const IGDB_API = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

export interface IgdbTimeToBeat {
  /** Minutos de la historia principal ("normally" en IGDB). */
  beatMinutes: number | null;
  /** Minutos para el 100% ("completely"). */
  completeMinutes: number | null;
}

/**
 * Resultado de consultar IGDB. Distinguir "no pudimos preguntar" de "IGDB no
 * lo sabe" **no es cosmético**: el caller marca el juego como consultado para
 * no volver a pedirlo nunca más, y hacer eso ante un fallo de credenciales o
 * de red quema el juego para siempre. Pasó de verdad: 13 juegos quedaron en
 * `none` porque las credenciales todavía no estaban cargadas.
 */
export type IgdbLookup =
  | { status: "ok"; times: IgdbTimeToBeat }
  /** IGDB contestó bien y no tiene tiempos para ese juego. */
  | { status: "not_found" }
  /** No se pudo preguntar (sin credenciales, red, 401, timeout). No cachear. */
  | { status: "unavailable"; reason: string };

/**
 * Token de app (client credentials), cacheado en memoria del proceso. Dura
 * ~60 días, así que pedir uno nuevo en cada request sería un round-trip de
 * más por ficha. Se renueva con un margen de 60s antes de vencer.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

type TokenResult = { token: string } | { error: string };

async function getAccessToken(): Promise<TokenResult> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return {
      error: `faltan credenciales (IGDB_CLIENT_ID: ${clientId ? "ok" : "AUSENTE"}, IGDB_CLIENT_SECRET: ${clientSecret ? "ok" : "AUSENTE"})`,
    };
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) return { token: cachedToken.value };

  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    // El cuerpo de Twitch dice exactamente qué está mal ("invalid client",
    // "invalid client secret"), y no contiene el secreto: se loguea entero
    // porque es la diferencia entre "la app es Público y no tiene secret" y
    // "copiaste mal el id".
    const detail = await response.text().catch(() => "");
    return {
      error: `Twitch rechazó las credenciales (${response.status}): ${detail.slice(0, 200)}`,
    };
  }

  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null)
    return { error: "Twitch devolvió un token ilegible" };
  const { access_token: token, expires_in: expiresIn } = data as Record<string, unknown>;
  if (typeof token !== "string" || token.length === 0) {
    return { error: "Twitch no devolvió access_token" };
  }

  const ttlSeconds = typeof expiresIn === "number" && expiresIn > 60 ? expiresIn : 3600;
  cachedToken = { value: token, expiresAt: Date.now() + (ttlSeconds - 60) * 1000 };
  return { token };
}

type QueryResult = { rows: unknown[] } | { error: string };

/**
 * IGDB habla APIcalypse: el body es una consulta de texto plano, no JSON, y
 * la respuesta sí es JSON.
 */
async function igdbQuery(endpoint: string, body: string): Promise<QueryResult> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const auth = await getAccessToken();
  if ("error" in auth) return { error: auth.error };
  if (!clientId) return { error: "falta IGDB_CLIENT_ID" };

  const response = await fetch(`${IGDB_API}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${auth.token}`,
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(8000),
  });

  if (response.status === 401) {
    // El token cacheado venció antes de tiempo (o lo revocaron): se tira y el
    // próximo llamado pide uno nuevo. No se reintenta acá para no encadenar
    // requests dentro del render de una ficha.
    cachedToken = null;
    return { error: `401 de IGDB en /${endpoint}: el token no sirve` };
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { error: `IGDB /${endpoint} respondió ${response.status}: ${detail.slice(0, 200)}` };
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) return { error: `IGDB /${endpoint} no devolvió un array` };
  return { rows: data };
}

/**
 * Tiempos estimados de un juego buscándolo por nombre.
 *
 * Loguea con prefijo `[igdb]` cada camino que no termina en datos. Sin eso, un
 * fallo de credenciales y un juego que IGDB no conoce se veían exactamente
 * igual desde afuera (la ficha sin la sección) y no había forma de saber cuál
 * era sin mirar la base.
 */
export async function findIgdbTimeToBeat(gameName: string): Promise<IgdbLookup> {
  try {
    // `search` de IGDB ordena por relevancia; se piden 10 porque el primero
    // suele ser un DLC o una edición cuando el título es de una saga larga.
    const escaped = gameName.replace(/"/g, '\\"');
    const found = await igdbQuery("games", `search "${escaped}"; fields id,name; limit 10;`);
    if ("error" in found) {
      console.error(`[igdb] no se pudo buscar "${gameName}": ${found.error}`);
      return { status: "unavailable", reason: found.error };
    }

    const candidates: IgdbGameCandidate[] = found.rows.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const { id, name } = entry as Record<string, unknown>;
      return typeof id === "number" && typeof name === "string" ? [{ id, name }] : [];
    });

    const game = pickIgdbGame(gameName, candidates);
    if (!game) {
      // Caso esperable y frecuente ("Skyrim" contra "The Elder Scrolls V:
      // Skyrim"): se loguea con los candidatos para poder afinar el match.
      console.warn(
        `[igdb] sin match exacto para "${gameName}" entre ${candidates.length} candidatos: ${candidates
          .map((c) => c.name)
          .join(" | ")}`,
      );
      return { status: "not_found" };
    }

    const times = await igdbQuery(
      "game_time_to_beat",
      `fields normally,completely; where game_id = ${game.id}; limit 1;`,
    );
    if ("error" in times) {
      console.error(`[igdb] no se pudieron pedir los tiempos de "${gameName}": ${times.error}`);
      return { status: "unavailable", reason: times.error };
    }
    if (times.rows.length === 0) {
      console.warn(`[igdb] "${gameName}" (id ${game.id}) no tiene tiempos cargados en IGDB`);
      return { status: "not_found" };
    }

    const first = times.rows[0];
    if (typeof first !== "object" || first === null) return { status: "not_found" };
    const { normally, completely } = first as Record<string, unknown>;

    const beatMinutes = secondsToMinutes(normally);
    const completeMinutes = secondsToMinutes(completely);
    if (beatMinutes === null && completeMinutes === null) return { status: "not_found" };

    return { status: "ok", times: { beatMinutes, completeMinutes } };
  } catch (cause) {
    // Timeout del AbortSignal, DNS, TLS: no pudimos preguntar, no es que IGDB
    // no sepa. No se cachea.
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`[igdb] falló la consulta de "${gameName}": ${reason}`);
    return { status: "unavailable", reason };
  }
}
