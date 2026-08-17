import "server-only";

export type SteamGuideLink = {
  title: string;
  url: string;
  source: "Steam Community";
};

/**
 * Resuelve el appid de Steam para un nombre de juego usando la búsqueda
 * pública de la store (sin API key, endpoint documentado y usado por el
 * propio widget de búsqueda de store.steampowered.com).
 */
async function resolveSteamAppId(gameName: string): Promise<number | null> {
  try {
    const url = new URL("https://store.steampowered.com/api/storesearch");
    url.searchParams.set("term", gameName);
    url.searchParams.set("cc", "us");
    url.searchParams.set("l", "english");

    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("items" in data) ||
      !Array.isArray((data as { items: unknown }).items)
    ) {
      return null;
    }

    const first = (data as { items: unknown[] }).items[0];
    if (typeof first !== "object" || first === null || !("id" in first)) return null;

    const id = (first as { id: unknown }).id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

/**
 * Trae las guías de la comunidad de Steam mejor puntuadas para un juego, vía
 * el endpoint oficial IPublishedFileService/QueryFiles de la Steam Web API
 * (requiere STEAM_API_KEY, gratis en steamcommunity.com/dev/apikey).
 * numbered_type 9 = guía. Devuelve [] si falta la key, no hay appid, o falla
 * la red -- nunca bloquea al resto de las fuentes.
 */
export async function findSteamGuides(
  gameName: string,
  limit = 5,
): Promise<SteamGuideLink[]> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) return [];

  const appId = await resolveSteamAppId(gameName);
  if (!appId) return [];

  try {
    const url = new URL("https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("query_type", "1"); // k_PublishedFileQueryType_RankedByVote
    url.searchParams.set("numperpage", String(limit));
    url.searchParams.set("appid", String(appId));
    url.searchParams.set("filetype", "11"); // k_EWorkshopFileType (WebGuide) -- 9 es "Concept", no guía
    url.searchParams.set("return_metadata", "true");

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];

    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("response" in data) ||
      typeof (data as { response: unknown }).response !== "object" ||
      (data as { response: unknown }).response === null
    ) {
      return [];
    }

    const filesRaw = (data as { response: { publishedfiledetails?: unknown } }).response
      .publishedfiledetails;
    if (!Array.isArray(filesRaw)) return [];

    return filesRaw
      .map((file): SteamGuideLink | null => {
        if (typeof file !== "object" || file === null) return null;
        const f = file as { publishedfileid?: unknown; title?: unknown };
        if (typeof f.publishedfileid !== "string" || typeof f.title !== "string") return null;
        return {
          title: f.title,
          url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${f.publishedfileid}`,
          source: "Steam Community",
        };
      })
      .filter((g): g is SteamGuideLink => g !== null);
  } catch {
    return [];
  }
}
