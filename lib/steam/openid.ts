import "server-only";
import { SteamApiError } from "./errors";
import { STEAM_MOCKS_ENABLED } from "./mocks";

/**
 * Steam OpenID ("Sign in through Steam").
 *
 * Es **OpenID 2.0**, no OIDC: no lo cubren las librerías de OAuth modernas, así
 * que el flujo va a mano. Es gratis y no usa `STEAM_API_KEY` -- es una
 * verificación de identidad contra la cuenta de Steam, no un método de login de
 * la app (el login sigue siendo Supabase Auth).
 */
const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const OPENID_IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";

/** `claimed_id` siempre vuelve como .../openid/id/<steamid64>. */
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** URL a la que mandar al usuario para que se loguee en Steam. */
export function buildSteamLoginUrl(returnToUrl: string, realm: string): string {
  const url = new URL(STEAM_OPENID_ENDPOINT);
  url.searchParams.set("openid.ns", OPENID_NS);
  url.searchParams.set("openid.mode", "checkid_setup");
  url.searchParams.set("openid.return_to", returnToUrl);
  url.searchParams.set("openid.realm", realm);
  url.searchParams.set("openid.identity", OPENID_IDENTIFIER_SELECT);
  url.searchParams.set("openid.claimed_id", OPENID_IDENTIFIER_SELECT);
  return url.toString();
}

/**
 * Valida la respuesta de Steam y devuelve el SteamID64 verificado, o null si la
 * respuesta no es auténtica.
 *
 * El paso de `check_authentication` **no es opcional**: los parámetros de la
 * URL de vuelta los puede escribir cualquiera a mano. Sin revalidarlos contra
 * Steam, "verificado" no significaría absolutamente nada -- que es justo el
 * problema que este flujo viene a resolver.
 */
export async function verifySteamOpenIdResponse(
  params: URLSearchParams,
): Promise<string | null> {
  if (params.get("openid.mode") !== "id_res") return null;

  const claimedId = params.get("openid.claimed_id");
  if (!claimedId) return null;

  const match = CLAIMED_ID_RE.exec(claimedId);
  if (!match) return null;

  // En la suite E2E no se sale a steamcommunity.com: la firma se simula con un
  // valor fijo, de modo que el test pueda ejercitar tanto la respuesta buena
  // como una falsificada. El resto del flujo (parseo y decisión) es el real.
  if (STEAM_MOCKS_ENABLED) {
    return params.get("openid.sig") === "e2e-firma-valida" ? match[1] : null;
  }

  // Se le devuelven a Steam exactamente los mismos parámetros que mandó,
  // cambiando solo el modo: cualquier recorte nuestro invalidaría la firma.
  const body = new URLSearchParams(params);
  body.set("openid.mode", "check_authentication");

  let response: Response;
  try {
    response = await fetch(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    throw new SteamApiError("No se pudo validar la respuesta de Steam.", cause);
  }

  if (!response.ok) {
    throw new SteamApiError(`Steam respondió ${response.status} al validar la sesión.`);
  }

  const text = await response.text();
  // La respuesta es texto plano tipo `ns:...\nis_valid:true\n`.
  const isValid = /^is_valid:true$/m.test(text.trim());
  return isValid ? match[1] : null;
}
