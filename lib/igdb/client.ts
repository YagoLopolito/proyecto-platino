import "server-only";

/**
 * Cliente de IGDB (Twitch/Amazon): auth de app + consultas APIcalypse.
 *
 * Lo comparten los tiempos estimados (`lib/time-to-beat/`) y los estudios
 * (`lib/igdb/companies.ts`). Toda llamada a IGDB pasa por acá, misma regla de
 * aislamiento que `lib/psn/`, `lib/steam/` y `lib/ai/`.
 *
 * Nada de esto tira: devuelve `{ error }` y el caller decide. Un error acá es
 * siempre "no se pudo preguntar" (`unavailable`), nunca "IGDB no lo sabe", y
 * **no se cachea** (ver CLAUDE.md, sección de `lib/time-to-beat/`).
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

export type QueryResult = { rows: unknown[] } | { error: string };

/**
 * IGDB habla APIcalypse: el body es una consulta de texto plano, no JSON, y
 * la respuesta sí es JSON.
 */
export async function igdbQuery(endpoint: string, body: string): Promise<QueryResult> {
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

/** URL de una imagen de IGDB (`cover.image_id`, `logo.image_id`). */
export function igdbImageUrl(imageId: unknown, size: "cover_big" | "logo_med"): string | null {
  if (typeof imageId !== "string" || imageId.length === 0) return null;
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.${size === "logo_med" ? "png" : "jpg"}`;
}

/** Escapa un string para meterlo entre comillas en una consulta APIcalypse. */
export function igdbString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
