import "server-only";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getProfileFromAccountId,
  getUserTrophyProfileSummary,
  type AuthTokensResponse,
} from "psn-api";
import { NpssoExpiredError } from "./errors";

/**
 * Cambia un NPSSO por tokens de autorización frescos.
 * No persistimos access/refresh tokens: como el NPSSO ya dura ~2 meses,
 * se vuelve a intercambiar en cada sync en vez de guardar tokens de corta vida.
 */
export async function getAuthorizationFromNpsso(npsso: string): Promise<AuthTokensResponse> {
  try {
    const accessCode = await exchangeNpssoForAccessCode(npsso);
    return await exchangeAccessCodeForAuthTokens(accessCode);
  } catch (error) {
    throw new NpssoExpiredError(error);
  }
}

export type PsnIdentity = { accountId: string; onlineId: string };

/** Valida un NPSSO y devuelve la identidad PSN (accountId/onlineId) asociada. */
export async function getPsnIdentityFromNpsso(npsso: string): Promise<PsnIdentity> {
  const authorization = await getAuthorizationFromNpsso(npsso);
  const [summary, profile] = await Promise.all([
    getUserTrophyProfileSummary(authorization, "me"),
    getProfileFromAccountId(authorization, "me"),
  ]);
  return { accountId: summary.accountId, onlineId: profile.onlineId };
}
