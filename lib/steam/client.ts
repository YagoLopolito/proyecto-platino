import "server-only";
import { SteamApiError, SteamApiKeyMissingError } from "./errors";
import { getSteamMockResponse, STEAM_MOCKS_ENABLED } from "./mocks";

const BASE_URL = "https://api.steampowered.com";
const TIMEOUT_MS = 10_000;

/**
 * Contador de llamadas por proceso. El rate limit de Steam son 100.000
 * llamadas por día **por key**, y la key es de la app: la comparten todos los
 * usuarios. El sync loguea cuántas gastó para saber cuánto margen queda.
 */
let callCount = 0;

export function getSteamCallCount(): number {
  return callCount;
}

function requireApiKey(): string {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new SteamApiKeyMissingError();
  return key;
}

/**
 * Única puerta de salida hacia la Steam Web API de tracking. Devuelve el JSON
 * crudo como `unknown`: tiparlo es responsabilidad de cada módulo, que lo
 * valida a mano (Steam no publica tipos y las respuestas cambian por endpoint).
 *
 * `notFoundAsNull` cubre los endpoints que devuelven 400/403 cuando el appid no
 * existe o el usuario no tiene stats para ese juego -- ahí "vacío" es un
 * resultado válido, no un error.
 */
export async function steamFetch(
  path: string,
  params: Record<string, string>,
  { notFoundAsNull = false }: { notFoundAsNull?: boolean } = {},
): Promise<unknown> {
  // Interruptor de la suite E2E. Se lee solo acá adentro de lib/ y nunca está
  // definido en Vercel: sin la variable, el único camino es la llamada real.
  if (STEAM_MOCKS_ENABLED) {
    const mocked = getSteamMockResponse(path, params);
    if (mocked !== undefined) {
      callCount += 1;
      return mocked;
    }
  }

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("key", requireApiKey());
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  callCount += 1;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (cause) {
    throw new SteamApiError(`No se pudo contactar a Steam (${path}).`, cause);
  }

  if (!response.ok) {
    if (notFoundAsNull && (response.status === 400 || response.status === 403)) {
      return null;
    }
    throw new SteamApiError(`Steam respondió ${response.status} en ${path}.`);
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new SteamApiError(`Steam devolvió una respuesta ilegible en ${path}.`, cause);
  }
}

/**
 * Boundary documentado: las respuestas de Steam entran como `unknown` y salen
 * como objetos indexables. Ninguna de estas funciones asume que las claves
 * existan -- eso lo chequea cada llamador.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readResponse(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) return null;
  return asRecord(root.response);
}

export function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

export function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
