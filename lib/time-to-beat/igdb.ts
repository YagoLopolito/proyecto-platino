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
 * Token de app (client credentials), cacheado en memoria del proceso. Dura
 * ~60 días, así que pedir uno nuevo en cada request sería un round-trip de
 * más por ficha. Se renueva con un margen de 60s antes de vencer.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(4000) });
  if (!response.ok) return null;

  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null) return null;
  const { access_token: token, expires_in: expiresIn } = data as Record<string, unknown>;
  if (typeof token !== "string" || token.length === 0) return null;

  const ttlSeconds = typeof expiresIn === "number" && expiresIn > 60 ? expiresIn : 3600;
  cachedToken = { value: token, expiresAt: Date.now() + (ttlSeconds - 60) * 1000 };
  return token;
}

/**
 * IGDB habla APIcalypse: el body es una consulta de texto plano, no JSON, y
 * la respuesta sí es JSON. Devuelve `null` ante cualquier problema (sin
 * credenciales, red caída, respuesta rara): los tiempos son decorativos y
 * nunca pueden tirar abajo la ficha.
 */
async function igdbQuery(endpoint: string, body: string): Promise<unknown[] | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const token = await getAccessToken();
  if (!clientId || !token) return null;

  const response = await fetch(`${IGDB_API}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(4000),
  });

  if (response.status === 401) {
    // El token cacheado venció antes de tiempo (o lo revocaron): se tira y el
    // próximo llamado pide uno nuevo. No se reintenta acá para no encadenar
    // requests dentro del render de una ficha.
    cachedToken = null;
    return null;
  }
  if (!response.ok) return null;

  const data: unknown = await response.json();
  return Array.isArray(data) ? data : null;
}

/**
 * Tiempos estimados de un juego buscándolo por nombre. `null` si no hay
 * credenciales, si IGDB no lo tiene, o si ningún candidato matchea exacto
 * (ver `pickIgdbGame`: mostrar el tiempo del juego equivocado es peor que no
 * mostrar ninguno).
 */
export async function findIgdbTimeToBeat(gameName: string): Promise<IgdbTimeToBeat | null> {
  try {
    // `search` de IGDB ordena por relevancia; se piden 10 porque el primero
    // suele ser un DLC o una edición cuando el título es de una saga larga.
    const escaped = gameName.replace(/"/g, '\\"');
    const found = await igdbQuery("games", `search "${escaped}"; fields id,name; limit 10;`);
    if (!found) return null;

    const candidates: IgdbGameCandidate[] = found.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const { id, name } = entry as Record<string, unknown>;
      return typeof id === "number" && typeof name === "string" ? [{ id, name }] : [];
    });

    const game = pickIgdbGame(gameName, candidates);
    if (!game) return null;

    const times = await igdbQuery(
      "game_time_to_beat",
      `fields normally,completely; where game_id = ${game.id}; limit 1;`,
    );
    if (!times || times.length === 0) return null;

    const first = times[0];
    if (typeof first !== "object" || first === null) return null;
    const { normally, completely } = first as Record<string, unknown>;

    const beatMinutes = secondsToMinutes(normally);
    const completeMinutes = secondsToMinutes(completely);
    if (beatMinutes === null && completeMinutes === null) return null;

    return { beatMinutes, completeMinutes };
  } catch {
    return null;
  }
}
