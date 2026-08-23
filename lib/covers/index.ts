import "server-only";

// Slugs que RAWG usa en parent_platforms para todo lo que sea PlayStation, de PS1 a PS5.
const PLAYSTATION_PLATFORM_SLUGS = new Set([
  "playstation5",
  "playstation4",
  "playstation3",
  "playstation2",
  "playstation",
  "ps-vita",
  "psp",
]);

/**
 * Fetch crudo contra la búsqueda de juegos de RAWG. Devuelve el array de
 * `results` sin narrowear, o `null` si falta la key, la red falla, o la
 * respuesta no tiene la forma esperada. Único punto que hace `fetch` a la
 * búsqueda de RAWG -- tanto `findCoverUrlFromRawg` como `searchCatalogGames`
 * pasan por acá para no reimplementar el cliente HTTP dos veces.
 */
async function fetchRawgGames(query: string, pageSize: number): Promise<unknown[] | null> {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL("https://api.rawg.io/api/games");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("search", query);
    url.searchParams.set("page_size", String(pageSize));

    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("results" in data) ||
      !Array.isArray((data as { results: unknown }).results)
    ) {
      return null;
    }

    return (data as { results: unknown[] }).results;
  } catch {
    return null;
  }
}

async function findCoverUrlFromRawg(gameName: string): Promise<string | null> {
  const results = await fetchRawgGames(gameName, 1);
  if (!results) return null;

  const first = results[0];
  if (
    typeof first !== "object" ||
    first === null ||
    !("background_image" in first)
  ) {
    return null;
  }

  const coverUrl = (first as { background_image: unknown }).background_image;
  return typeof coverUrl === "string" && coverUrl.length > 0 ? coverUrl : null;
}

async function findCoverUrlFromSteamGridDb(gameName: string): Promise<string | null> {
  const apiKey = process.env.STEAMGRIDDB_API_KEY;
  if (!apiKey) return null;

  try {
    const searchUrl = new URL(
      `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(gameName)}`,
    );
    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!searchResponse.ok) return null;

    const searchData: unknown = await searchResponse.json();
    if (
      typeof searchData !== "object" ||
      searchData === null ||
      !("data" in searchData) ||
      !Array.isArray((searchData as { data: unknown }).data)
    ) {
      return null;
    }

    const firstGame = (searchData as { data: unknown[] }).data[0];
    if (
      typeof firstGame !== "object" ||
      firstGame === null ||
      !("id" in firstGame) ||
      typeof (firstGame as { id: unknown }).id !== "number"
    ) {
      return null;
    }
    const gameId = (firstGame as { id: number }).id;

    const gridUrl = new URL(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}`);
    gridUrl.searchParams.set("dimensions", "600x900");
    const gridResponse = await fetch(gridUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!gridResponse.ok) return null;

    const gridData: unknown = await gridResponse.json();
    if (
      typeof gridData !== "object" ||
      gridData === null ||
      !("data" in gridData) ||
      !Array.isArray((gridData as { data: unknown }).data)
    ) {
      return null;
    }

    const firstGrid = (gridData as { data: unknown[] }).data[0];
    if (
      typeof firstGrid !== "object" ||
      firstGrid === null ||
      !("url" in firstGrid)
    ) {
      return null;
    }

    const coverUrl = (firstGrid as { url: unknown }).url;
    return typeof coverUrl === "string" && coverUrl.length > 0 ? coverUrl : null;
  } catch {
    return null;
  }
}

/**
 * Complementa la carátula de un juego usando RAWG cuando el ícono que trae PSN
 * no alcanza, con SteamGridDB como fallback si RAWG no encuentra nada. Nunca
 * rompe el flujo que la llama: si faltan las API keys, falla la red, o no hay
 * resultados en ninguna de las dos, devuelve null.
 */
export async function findCoverUrl(gameName: string): Promise<string | null> {
  const fromRawg = await findCoverUrlFromRawg(gameName);
  if (fromRawg) return fromRawg;

  return findCoverUrlFromSteamGridDb(gameName);
}

export interface CatalogSearchResult {
  externalId: string;
  name: string;
  coverUrl: string | null;
  platforms: string[];
  releaseYear: number | null;
}

export type CatalogSearchOutcome =
  | { status: "ok"; results: CatalogSearchResult[] }
  | { status: "missing_api_key" }
  | { status: "error"; message: string };

function toCatalogSearchResult(raw: unknown): CatalogSearchResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "number" && typeof obj.id !== "string") return null;
  if (typeof obj.name !== "string") return null;

  const platforms = Array.isArray(obj.parent_platforms)
    ? obj.parent_platforms
        .map((entry) =>
          typeof entry === "object" && entry !== null && "platform" in entry
            ? (entry as { platform: unknown }).platform
            : null,
        )
        .map((platform) =>
          typeof platform === "object" && platform !== null && "slug" in platform
            ? (platform as { slug: unknown }).slug
            : null,
        )
        .filter((slug): slug is string => typeof slug === "string")
    : [];

  const releasedRaw = obj.released;
  const releaseYear =
    typeof releasedRaw === "string" && releasedRaw.length >= 4
      ? Number.parseInt(releasedRaw.slice(0, 4), 10)
      : null;

  return {
    externalId: String(obj.id),
    name: obj.name,
    coverUrl: typeof obj.background_image === "string" ? obj.background_image : null,
    platforms,
    releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
  };
}

function isPlayStationTitle(result: CatalogSearchResult): boolean {
  return result.platforms.some((slug) => PLAYSTATION_PLATFORM_SLUGS.has(slug));
}

/**
 * Búsqueda de catálogo con varios candidatos (a diferencia de `findCoverUrl`,
 * que sólo trae la mejor carátula). Usada por `lib/catalog/` para el alta de
 * juegos al diario. Nunca se llama a la búsqueda de RAWG fuera de este módulo.
 */
export async function searchCatalogGames(
  query: string,
  opts?: { pageSize?: number },
): Promise<CatalogSearchOutcome> {
  if (!process.env.RAWG_API_KEY) return { status: "missing_api_key" };
  if (!query.trim()) return { status: "ok", results: [] };

  try {
    const rawResults = await fetchRawgGames(query, opts?.pageSize ?? 10);
    if (rawResults === null) {
      return { status: "error", message: "No se pudo consultar RAWG" };
    }

    const results = rawResults
      .map(toCatalogSearchResult)
      .filter((result): result is CatalogSearchResult => result !== null)
      .filter(isPlayStationTitle);

    return { status: "ok", results };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export interface GameDetails {
  description: string | null;
  developer: string | null;
  releaseYear: number | null;
  backgroundUrl: string | null;
  coverUrl: string | null;
}

function firstString(raw: unknown, key: string): string | null {
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    if (typeof entry === "object" && entry !== null && key in entry) {
      const value = (entry as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return null;
}

/**
 * Detalle de un juego en RAWG (`/games/{id}`): es el único endpoint que trae
 * la descripción y la desarrolladora -- la búsqueda no las incluye. Devuelve
 * null si falta la key, falla la red o la respuesta no tiene la forma esperada;
 * es información decorativa, nunca puede romper la página que la pide.
 */
export async function fetchGameDetails(externalId: string): Promise<GameDetails | null> {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL(`https://api.rawg.io/api/games/${encodeURIComponent(externalId)}`);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;
    const obj = data as Record<string, unknown>;

    const released = typeof obj.released === "string" ? Number(obj.released.slice(0, 4)) : NaN;

    return {
      // `description_raw` es la descripción sin HTML (la otra viene con <p>).
      description: typeof obj.description_raw === "string" ? obj.description_raw : null,
      developer: firstString(obj.developers, "name"),
      releaseYear: Number.isFinite(released) ? released : null,
      backgroundUrl:
        typeof obj.background_image_additional === "string"
          ? obj.background_image_additional
          : typeof obj.background_image === "string"
            ? obj.background_image
            : null,
      coverUrl: typeof obj.background_image === "string" ? obj.background_image : null,
    };
  } catch {
    return null;
  }
}

/**
 * Igual que `fetchGameDetails` pero partiendo del nombre: resuelve primero el
 * id de RAWG con la búsqueda normal. Para juegos que llegaron por el sync de
 * PSN, que no tienen `external_catalog_id`.
 */
export async function findGameDetailsByName(name: string): Promise<GameDetails | null> {
  const outcome = await searchCatalogGames(name, { pageSize: 1 });
  if (outcome.status !== "ok" || outcome.results.length === 0) return null;
  return fetchGameDetails(outcome.results[0].externalId);
}
