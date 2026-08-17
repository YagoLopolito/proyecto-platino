import "server-only";

async function findCoverUrlFromRawg(gameName: string): Promise<string | null> {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL("https://api.rawg.io/api/games");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("search", gameName);
    url.searchParams.set("page_size", "1");

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

    const first = (data as { results: unknown[] }).results[0];
    if (
      typeof first !== "object" ||
      first === null ||
      !("background_image" in first)
    ) {
      return null;
    }

    const coverUrl = (first as { background_image: unknown }).background_image;
    return typeof coverUrl === "string" && coverUrl.length > 0 ? coverUrl : null;
  } catch {
    return null;
  }
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
