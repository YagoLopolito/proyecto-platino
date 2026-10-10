import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Ata la respuesta de Steam OpenID a la sesión que arrancó el flujo (issue #157).
 *
 * La firma de Steam (`check_authentication`) prueba que **alguien** se logueó en
 * Steam, no que sea quien está sentado en esta sesión: sin esto, la URL de vuelta
 * firmada de un atacante, abierta por una víctima logueada, le conectaba la
 * cuenta de Steam del atacante como verificada.
 *
 * - Al arrancar se genera un `state` aleatorio, que va en una cookie `HttpOnly` y
 *   dentro del `openid.return_to` (Steam lo firma junto con el resto).
 * - Al volver, el `state` de la URL tiene que coincidir con el de la cookie, el
 *   `return_to` firmado tiene que apuntar a esta misma ruta y llevar ese `state`,
 *   y el `response_nonce` tiene que ser reciente. La cookie se borra siempre, así
 *   que cada `state` sirve una sola vez.
 *
 * Módulo puro y sin `server-only` a propósito: se testea desde el spec.
 */

export const STEAM_OPENID_STATE_COOKIE = "steam_openid_state";
export const STEAM_OPENID_PATH = "/api/steam/openid";
/** Lo que tiene el usuario para loguearse en Steam y volver. */
export const STEAM_OPENID_STATE_MAX_AGE_S = 10 * 60;

/** Margen para relojes desfasados entre Steam y Vercel. */
const NONCE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function generateOpenIdState(): string {
  return randomBytes(32).toString("base64url");
}

/** `return_to` que se le pasa a Steam: esta misma ruta con el `state`. */
export function buildReturnTo(origin: string, state: string): string {
  const url = new URL(STEAM_OPENID_PATH, origin);
  url.searchParams.set("state", state);
  return url.toString();
}

function sameSecret(a: string, b: string): boolean {
  // SHA-256 para que los buffers tengan el mismo largo (mismo criterio que
  // `lib/cron/auth.ts`): `timingSafeEqual` tira con largos distintos.
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * `true` si el `response_nonce` arranca con un timestamp ISO reciente. Steam lo
 * manda como `2026-10-10T18:00:00Z<sufijo>`.
 */
export function isFreshResponseNonce(nonce: string | null, now: number = Date.now()): boolean {
  if (!nonce) return false;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/.exec(nonce);
  if (!match) return false;
  const issuedAt = Date.parse(match[1]);
  if (Number.isNaN(issuedAt)) return false;
  return (
    issuedAt <= now + NONCE_CLOCK_SKEW_MS &&
    now - issuedAt <= STEAM_OPENID_STATE_MAX_AGE_S * 1000 + NONCE_CLOCK_SKEW_MS
  );
}

/**
 * ¿La respuesta de Steam pertenece al flujo que arrancó esta sesión? No mira la
 * firma (eso es `verifySteamOpenIdResponse`): sólo el atado a la sesión.
 */
export function matchesOpenIdSession(
  params: URLSearchParams,
  cookieState: string | undefined,
  origin: string,
  now: number = Date.now(),
): boolean {
  const state = params.get("state");
  if (!state || !cookieState || !sameSecret(state, cookieState)) return false;

  const returnTo = params.get("openid.return_to");
  if (!returnTo) return false;
  let returnUrl: URL;
  try {
    returnUrl = new URL(returnTo);
  } catch {
    return false;
  }
  if (returnUrl.origin !== origin || returnUrl.pathname !== STEAM_OPENID_PATH) return false;
  const signedState = returnUrl.searchParams.get("state");
  if (!signedState || !sameSecret(signedState, state)) return false;

  return isFreshResponseNonce(params.get("openid.response_nonce"), now);
}
