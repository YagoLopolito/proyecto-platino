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
 * Puebla game_external_guides para un juego con guías de TROFEOS/LOGROS
 * (no con cualquier contenido del juego), combinando Steam (API oficial,
 * filtrada por la etiqueta "Achievements" + heurística de título) y links a
 * la búsqueda de guías de trofeos en PowerPyx/PSNProfiles/TrueTrophies/
 * YouTube. Ninguna de las dos fuentes es paga ni hace scraping: Steam usa su
 * Web API oficial, y las otras son solo un link a la búsqueda propia de cada
 * sitio (ver lib/external-guides/site-search.ts).
 *
 * Usa el cliente service-role porque estas filas no son contenido de usuario
 * -- la tabla no tiene policies de insert para `authenticated` a propósito
 * (ver migración). Si Steam falla no bloquea a los links de búsqueda.
 *
 * Antes de insertar borra los enlaces previos del juego: son todos generados
 * por esta misma función, así que volver a buscar tiene que poder limpiar
 * resultados viejos que ya no pasan el filtro (los enlaces de Steam de antes
 * de este filtro eran guías de cualquier tema). Los `id` cambian, pero nada
 * referencia a estas filas.
 */
export async function populateExternalGuidesForGame(
  gameId: string,
  gameName: string,
): Promise<PopulateExternalGuidesResult> {
  const errors: string[] = [];

  const rows: {
    game_id: string;
    title: string;
    url: string;
    source: string;
    source_type: "steam_api" | "site_search";
  }[] = [];

  try {
    const steamGuides = await findSteamGuides(gameName);
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

  if (rows.length === 0) {
    return { inserted: 0, errors };
  }

  const supabase = createServiceClient();

  const { error: deleteError } = await supabase
    .from("game_external_guides")
    .delete()
    .eq("game_id", gameId);

  if (deleteError) {
    errors.push(`No se pudieron limpiar los enlaces anteriores: ${deleteError.message}`);
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
