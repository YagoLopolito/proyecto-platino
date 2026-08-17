import "server-only";

/**
 * Complementa la carátula de un juego usando RAWG cuando el ícono que trae PSN
 * no alcanza. Nunca rompe el flujo que la llama: si falta la API key, falla la
 * red, o no hay resultados, devuelve null.
 */
export async function findCoverUrl(gameName: string): Promise<string | null> {
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
