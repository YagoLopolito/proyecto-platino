import "server-only";
import { looksLikeAchievementGuide } from "./relevance";

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

type SteamGuideCandidate = {
  title: string;
  publishedFileId: string;
  tags: string[];
};

/**
 * Una consulta a IPublishedFileService/QueryFiles. `requiredTag` filtra del
 * lado de Steam por la etiqueta que los autores le ponen a la guía
 * ("Achievements" es la etiqueta oficial de guías de logros); `searchText`
 * filtra por texto. Se piden más resultados de los que vamos a mostrar
 * porque después filtramos por relevancia del lado nuestro.
 */
async function queryPublishedFiles(
  apiKey: string,
  appId: number,
  {
    requiredTag,
    searchText,
    numPerPage,
  }: { requiredTag?: string; searchText?: string; numPerPage: number },
): Promise<SteamGuideCandidate[]> {
  try {
    const url = new URL("https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("query_type", "1"); // k_PublishedFileQueryType_RankedByVote
    url.searchParams.set("numperpage", String(numPerPage));
    url.searchParams.set("appid", String(appId));
    url.searchParams.set("filetype", "11"); // k_EWorkshopFileType (WebGuide) -- 9 es "Concept", no guía
    url.searchParams.set("return_tags", "true");
    url.searchParams.set("return_metadata", "true");
    if (requiredTag) url.searchParams.set("requiredtags[0]", requiredTag);
    if (searchText) url.searchParams.set("search_text", searchText);

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
      .map((file): SteamGuideCandidate | null => {
        if (typeof file !== "object" || file === null) return null;
        const f = file as { publishedfileid?: unknown; title?: unknown; tags?: unknown };
        if (typeof f.publishedfileid !== "string" || typeof f.title !== "string") return null;

        // `tags` viene como [{ tag: "Achievements" }, ...] cuando se pide
        // return_tags; en algunas respuestas viene como strings sueltos.
        const tags = Array.isArray(f.tags)
          ? f.tags
              .map((tag) => {
                if (typeof tag === "string") return tag;
                if (typeof tag === "object" && tag !== null && "tag" in tag) {
                  const value = (tag as { tag: unknown }).tag;
                  return typeof value === "string" ? value : null;
                }
                return null;
              })
              .filter((tag): tag is string => tag !== null)
          : [];

        return { title: f.title, publishedFileId: f.publishedfileid, tags };
      })
      .filter((g): g is SteamGuideCandidate => g !== null);
  } catch {
    return [];
  }
}

/**
 * Trae guías de logros de Steam Community para un juego, vía el endpoint
 * oficial IPublishedFileService/QueryFiles de la Steam Web API (requiere
 * STEAM_API_KEY, gratis en steamcommunity.com/dev/apikey).
 *
 * Buscar solo por appid devolvía CUALQUIER guía del juego (builds, mods,
 * ajustes de rendimiento, lore), que no es lo que queremos. Acá se filtra en
 * tres capas: la etiqueta oficial "Achievements" del lado de Steam, una
 * consulta por texto ("achievements guide") como respaldo cuando el juego no
 * tiene guías etiquetadas, y `looksLikeAchievementGuide` sobre título+tags
 * para descartar lo que igual se cuele.
 *
 * Devuelve [] si falta la key, no hay appid o falla la red -- nunca bloquea
 * al resto de las fuentes.
 */
export async function findSteamGuides(
  gameName: string,
  limit = 5,
): Promise<SteamGuideLink[]> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) return [];

  const appId = await resolveSteamAppId(gameName);
  if (!appId) return [];

  // Las dos consultas son independientes: en paralelo cuestan lo mismo que la
  // más lenta, y este Server Action ya está cerca del techo de duración.
  const [tagged, searched] = await Promise.all([
    queryPublishedFiles(apiKey, appId, { requiredTag: "Achievements", numPerPage: limit * 2 }),
    queryPublishedFiles(apiKey, appId, {
      searchText: "achievements trophies 100%",
      numPerPage: limit * 2,
    }),
  ]);

  const byId = new Map<string, SteamGuideCandidate>();
  for (const candidate of tagged) {
    // Los etiquetados "Achievements" ya vienen filtrados por Steam: entran sin
    // pasar por la heurística de título.
    byId.set(candidate.publishedFileId, candidate);
  }
  for (const candidate of searched) {
    if (byId.has(candidate.publishedFileId)) continue;
    if (!looksLikeAchievementGuide(candidate.title, candidate.tags)) continue;
    byId.set(candidate.publishedFileId, candidate);
  }

  return [...byId.values()].slice(0, limit).map((candidate) => ({
    title: candidate.title,
    url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${candidate.publishedFileId}`,
    source: "Steam Community" as const,
  }));
}
