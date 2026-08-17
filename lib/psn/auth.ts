import "server-only";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getProfileFromAccountId,
  getUserTrophyProfileSummary,
  type AuthTokensResponse,
} from "psn-api";
import { NpssoExpiredError } from "./errors";

export type PsnIdentity = { accountId: string; onlineId: string };

/** Cambia el NPSSO del usuario por tokens de acceso/refresh de la API de PSN. */
export async function getAuthorizationFromNpsso(npsso: string): Promise<AuthTokensResponse> {
  try {
    const accessCode = await exchangeNpssoForAccessCode(npsso);
    return await exchangeAccessCodeForAuthTokens(accessCode);
  } catch (cause) {
    throw new NpssoExpiredError(cause);
  }
}

/**
 * Identifica al usuario autenticado (accountId numérico + onlineId).
 *
 * IMPORTANTE: `getProfileFromAccountId` NO acepta el alias "me" -- arma la URL
 * sustituyendo el valor literal en el path, a diferencia de otras funciones de
 * psn-api que sí resuelven "me" del lado del servidor. Por eso hay que pedir
 * primero el resumen de trofeos (que sí acepta "me") para sacar el accountId
 * numérico, y recién ahí pedir el perfil con ese id. Pasarle "me" directamente
 * rompe el flujo de conexión con un error genérico.
 */
export async function getPsnIdentityFromNpsso(npsso: string): Promise<PsnIdentity> {
  const authorization = await getAuthorizationFromNpsso(npsso);

  const trophySummary = await getUserTrophyProfileSummary(authorization, "me");
  const profile = await getProfileFromAccountId(authorization, trophySummary.accountId);

  return { accountId: trophySummary.accountId, onlineId: profile.onlineId };
}
