import "server-only";
import type { IgdbGameLookup, IgdbGameDetails } from "./games";
import type {
  IgdbCompany,
  IgdbCompanyRef,
  IgdbCompanySearchHit,
  IgdbStudioGame,
} from "./companies";

/**
 * Mock determinista de IGDB para la suite E2E (issue #193).
 *
 * `E2E_MOCKS` se lee **sólo acá adentro de `lib/`** (regla de CLAUDE.md). En
 * Vercel la variable nunca está definida, así que en producción sólo corre el
 * camino real.
 *
 * Todos los ids de test viven arriba de `E2E_IGDB_ID_MIN`, que el teardown usa
 * para limpiar `games` y `companies` (tiene que coincidir con
 * `E2E_IGDB_ID_MIN` de `e2e/helpers/ids.ts`; `lib/` no importa de `e2e/`).
 * Los ids reales de IGDB están muy por debajo.
 */

export const IGDB_MOCKS_ENABLED = process.env.E2E_MOCKS === "1";

const E2E_IGDB_ID_MIN = 900_000_000;

/** Nombre con este marcador = IGDB no se pudo consultar (el caso que no se cachea). */
const UNAVAILABLE_MARKER = "SIN-IGDB";

export const MOCK_STUDIO: IgdbCompany = {
  igdbId: 902_000_001,
  name: "[E2E] Estudio",
  slug: "e2e-estudio",
  logoUrl: null,
  description: "Estudio inventado para la suite E2E.",
  countryCode: 32,
  parent: { igdbId: 902_000_002, name: "[E2E] Editora", slug: "e2e-editora" },
  developedIds: [901_000_001, 901_000_002],
  publishedIds: [],
};

export const MOCK_PUBLISHER: IgdbCompany = {
  igdbId: 902_000_002,
  name: "[E2E] Editora",
  slug: "e2e-editora",
  logoUrl: null,
  description: null,
  countryCode: null,
  parent: null,
  developedIds: [],
  publishedIds: [901_000_001, 901_000_002],
};

const MOCK_STUDIO_GAMES: IgdbStudioGame[] = [
  { igdbId: 901_000_001, name: "[E2E] Juego del estudio A", coverUrl: null, year: 2021 },
  { igdbId: 901_000_002, name: "[E2E] Juego del estudio B", coverUrl: null, year: 2019 },
];

/** Hash chico y estable del nombre: cada juego `[E2E]` tiene su id de IGDB. */
function mockGameId(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 900_000;
  return E2E_IGDB_ID_MIN + hash;
}

export function mockResolveGame(gameName: string): IgdbGameLookup {
  if (gameName.includes(UNAVAILABLE_MARKER)) return { status: "unavailable", reason: "mock" };
  if (!gameName.startsWith("[E2E]")) return { status: "not_found" };
  return { status: "ok", id: mockGameId(gameName), name: gameName };
}

/** Todo juego de test lo desarrolla el estudio y lo publica la editora. */
export function mockGameCompanies(igdbGameId: number): IgdbCompanyRef[] {
  if (igdbGameId < E2E_IGDB_ID_MIN) return [];
  return [
    { ...refOf(MOCK_STUDIO), roles: ["developer"] },
    { ...refOf(MOCK_PUBLISHER), roles: ["publisher"] },
  ];
}

function refOf(company: IgdbCompany): Omit<IgdbCompanyRef, "roles"> {
  return {
    igdbId: company.igdbId,
    name: company.name,
    slug: company.slug,
    logoUrl: company.logoUrl,
  };
}

export function mockCompany(where: { slug: string } | { igdbId: number }): IgdbCompany | null {
  return (
    [MOCK_STUDIO, MOCK_PUBLISHER].find((company) =>
      "slug" in where ? company.slug === where.slug : company.igdbId === where.igdbId,
    ) ?? null
  );
}

export function mockGamesByIds(ids: number[]): IgdbStudioGame[] {
  return MOCK_STUDIO_GAMES.filter((game) => ids.includes(game.igdbId));
}

export function mockGameDetails(igdbId: number): IgdbGameDetails | null {
  const game = MOCK_STUDIO_GAMES.find((candidate) => candidate.igdbId === igdbId);
  if (!game) return null;
  return {
    igdbId,
    name: game.name,
    coverUrl: null,
    releaseYear: game.year,
    description: "Juego inventado para la suite E2E.",
  };
}

/** Búsqueda de estudios: sólo los dos de test, por "contiene" sin mayúsculas. */
export function mockSearchCompanies(query: string): IgdbCompanySearchHit[] {
  const needle = query.toLowerCase();
  return [MOCK_STUDIO, MOCK_PUBLISHER]
    .filter((company) => company.name.toLowerCase().includes(needle))
    .map((company) => ({
      ...refOf(company),
      gameCount: new Set([...company.developedIds, ...company.publishedIds]).size,
    }));
}
