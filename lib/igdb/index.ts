import "server-only";

export { resolveIgdbGame, fetchIgdbGameDetails, type IgdbGameLookup } from "./games";
export {
  fetchGameCompanies,
  fetchCompany,
  fetchGamesByIds,
  type CompanyRole,
  type IgdbCompany,
  type IgdbCompanyRef,
  type IgdbStudioGame,
} from "./companies";
