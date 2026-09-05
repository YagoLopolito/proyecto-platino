import "server-only";
import { RELEVANT_STEAM_TAGS, rankSteamGuides } from "./steam-relevance";

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

type RawSteamGuide = { id: string; title: string; url: string; source: "Steam Community" };

/**
 * Una llamada a IPublishedFileService/QueryFiles. `params` son los que varían
 * entre la consulta por etiqueta y la de texto libre; el resto (appid, tipo de
 * archivo, key) es siempre igual. Devuelve [] ante cualquier fallo: esta
 * fuente nunca puede bloquear a los links de búsqueda.
 */
async function queryFiles(
  apiKey: string,
  appId: number,
  params: Record<string, string>,
): Promise<RawSteamGuide[]> {
  try {
    const url = new URL("https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("appid", String(appId));
    url.searchParams.set("filetype", "11"); // k_EWorkshopFileType (WebGuide) -- 9 es "Concept", no guía
    url.searchParams.set("return_metadata", "true");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

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
      .map((file): RawSteamGuide | null => {
        if (typeof file !== "object" || file === null) return null;
        const f = file as { publishedfileid?: unknown; title?: unknown };
        if (typeof f.publishedfileid !== "string" || typeof f.title !== "string") return null;
        return {
          id: f.publishedfileid,
          title: f.title,
          url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${f.publishedfileid}`,
          source: "Steam Community",
        };
      })
      .filter((g): g is RawSteamGuide => g !== null);
  } catch {
    return [];
  }
}

/**
 * Trae guías de la comunidad de Steam **útiles para completar el juego**
 * (logros, 100%, walkthroughs, builds, coleccionables), vía el endpoint
 * oficial IPublishedFileService/QueryFiles de la Steam Web API (requiere
 * STEAM_API_KEY, gratis en steamcommunity.com/dev/apikey).
 *
 * No alcanza con pedir lo más votado: en la mayoría de los juegos el top de
 * votos son traducciones no oficiales, mods y curiosidades. Se hacen dos
 * consultas y se cruzan:
 *
 * 1. Por etiqueta (`requiredtags` + `match_all_tags=false`): las etiquetas de
 *    guía las pone el autor, así que "Achievements"/"Walkthroughs" es la mejor
 *    señal disponible. Estas entran aunque el título no diga nada.
 * 2. Por texto (`query_type=12`, ranked by text search) con los términos de
 *    platino/100%/builds, para los juegos donde nadie etiquetó las guías.
 *
 * Después `rankSteamGuides` saca el ruido conocido y ordena por relevancia.
 * Devuelve [] si falta la key, no hay appid o falla la red -- nunca bloquea al
 * resto de las fuentes.
 */
export async function findSteamGuides(gameName: string, limit = 5): Promise<SteamGuideLink[]> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) return [];

  const appId = await resolveSteamAppId(gameName);
  if (!appId) return [];

  const taggedParams: Record<string, string> = {
    query_type: "1", // k_PublishedFileQueryType_RankedByVote, ya acotado por las etiquetas
    numperpage: String(limit * 2),
    match_all_tags: "false",
  };
  RELEVANT_STEAM_TAGS.forEach((tag, i) => {
    taggedParams[`requiredtags[${i}]`] = tag;
  });

  const [tagged, byText] = await Promise.all([
    queryFiles(apiKey, appId, taggedParams),
    queryFiles(apiKey, appId, {
      query_type: "12", // k_PublishedFileQueryType_RankedByTextSearch
      numperpage: String(limit * 2),
      search_text: "achievements 100% completion walkthrough build",
    }),
  ]);

  const taggedIds = new Set(tagged.map((guide) => guide.id));
  const deduped = new Map<string, RawSteamGuide>();
  for (const guide of [...tagged, ...byText]) {
    if (!deduped.has(guide.id)) deduped.set(guide.id, guide);
  }

  return rankSteamGuides([...deduped.values()], taggedIds, limit).map(({ title, url, source }) => ({
    title,
    url,
    source,
  }));
}
