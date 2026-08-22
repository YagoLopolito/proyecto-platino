import "server-only";

export { encryptSecret, decryptSecret } from "./crypto";
export {
  getAuthorizationFromNpsso,
  getPsnIdentityFromNpsso,
  getPsnTrophySummary,
  type PsnIdentity,
  type PsnTrophySummary,
} from "./auth";
export { NpssoExpiredError } from "./errors";
export { fetchUserTitlesWithTrophies, type FetchedTitle, type FetchedTrophy } from "./trophies";
export { syncTrophiesForUser, type SyncResult } from "./sync";
export { PLATFORMS, mapPsnPlatformToLocal, type Platform } from "./platform";
