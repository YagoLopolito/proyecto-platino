import "server-only";

export { resolveIgdbGame, fetchIgdbGameDetails, type IgdbGameLookup } from "./games";
export {
  fetchGameCompanies,
  fetchCompany,
  fetchGamesByIds,
  searchCompanies,
  type CompanyRole,
  type IgdbCompany,
  type IgdbCompanyRef,
  type IgdbCompanySearchHit,
  type IgdbStudioGame,
} from "./companies";
