import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { findSteamGuides } from "./steam";
import { buildSiteSearchLinks } from "./site-search";
import { ExternalGuideSourceError } from "./errors";

export type PopulateExternalGuidesResult = {
  inserted: number;
  errors: string[];
};

/**
 * Puebla game_external_guides para un juego combinando Steam (API oficial)
 * y links de búsqueda a PowerPyx/PSNProfiles/TrueTrophies. Ninguna de las
 * dos fuentes es paga ni hace scraping: Steam usa su Web API oficial, y los
 * otros tres son solo un link a la búsqueda propia de cada sitio (ver
 * lib/external-guides/site-search.ts). Usa el cliente service-role porque
 * estas filas no son contenido de usuario -- la tabla no tiene policies de
 * insert para `authenticated` a propósito (ver migración). Si Steam falla
 * no bloquea a los links de búsqueda; los duplicados por (game_id, url) se
 * ignoran vía upsert con ignoreDuplicates. Las filas de Steam se rearman en
 * cada corrida (ver el borrado más abajo) para que un cambio en el filtro de
 * relevancia limpie lo que había quedado guardado antes.
 */
export async function populateExternalGuidesForGame(
  gameId: string,
  gameName: string,
): Promise<PopulateExternalGuidesResult> {
  const errors: string[] = [];
  // Solo se limpian las guías de Steam viejas si Steam efectivamente contestó:
  // si la API falla, borrar sin nada con qué reemplazar dejaría la página peor
  // que antes.
  let steamAnswered = false;

  const rows: {
    game_id: string;
    title: string;
    url: string;
    source: string;
    source_type: "steam_api" | "site_search";
  }[] = [];

  try {
    const steamGuides = await findSteamGuides(gameName);
    steamAnswered = true;
    for (const guide of steamGuides) {
      rows.push({
        game_id: gameId,
        title: guide.title,
        url: guide.url,
        source: guide.source,
        source_type: "steam_api",
      });
    }
  } catch (cause) {
    errors.push(
      cause instanceof ExternalGuideSourceError
        ? cause.message
        : "Falló la búsqueda de guías en Steam.",
    );
  }

  for (const link of buildSiteSearchLinks(gameName)) {
    rows.push({
      game_id: gameId,
      title: link.title,
      url: link.url,
      source: link.source,
      source_type: "site_search",
    });
  }

  const supabase = createServiceClient();

  /*
   * Las filas de Steam se rearman en cada búsqueda en vez de acumularse. El
   * upsert por (game_id, url) nunca borra nada, así que los enlaces guardados
   * por una versión anterior del filtro -- traducciones al ruso, mods --
   * seguían apareciendo para siempre aunque el ranking ya no los devuelva.
   * Los links de búsqueda (site_search) no se tocan: son estables y no
   * dependen del filtro.
   */
  if (steamAnswered) {
    const { error: cleanupError } = await supabase
      .from("game_external_guides")
      .delete()
      .eq("game_id", gameId)
      .eq("source_type", "steam_api");

    if (cleanupError) {
      errors.push(`No se pudieron limpiar los enlaces viejos de Steam: ${cleanupError.message}`);
    }
  }

  if (rows.length === 0) {
    return { inserted: 0, errors };
  }

  const { error, count } = await supabase
    .from("game_external_guides")
    .upsert(rows, { onConflict: "game_id,url", ignoreDuplicates: true, count: "exact" });

  if (error) {
    errors.push(`No se pudieron guardar los enlaces encontrados: ${error.message}`);
    return { inserted: 0, errors };
  }

  return { inserted: count ?? rows.length, errors };
}
