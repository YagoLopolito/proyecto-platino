import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { findSteamGuides } from "./steam";
import { findAiCuratedGuideLinks } from "./ai-search";
import { ExternalGuideSourceError } from "./errors";

export type PopulateExternalGuidesResult = {
  inserted: number;
  errors: string[];
};

/**
 * Puebla game_external_guides para un juego combinando Steam (API oficial)
 * y búsqueda con IA acotada a PowerPyx/PSNProfiles/TrueTrophies. Usa el
 * cliente service-role porque estas filas no son contenido de usuario -- la
 * tabla no tiene policies de insert para `authenticated` a propósito (ver
 * migración). Si una fuente falla no bloquea a la otra; los duplicados por
 * (game_id, url) se ignoran vía upsert con ignoreDuplicates.
 */
export async function populateExternalGuidesForGame(
  gameId: string,
  gameName: string,
): Promise<PopulateExternalGuidesResult> {
  const errors: string[] = [];

  const [steamResult, aiResult] = await Promise.allSettled([
    findSteamGuides(gameName),
    findAiCuratedGuideLinks(gameName),
  ]);

  const rows: {
    game_id: string;
    title: string;
    url: string;
    source: string;
    source_type: "steam_api" | "ai_search";
  }[] = [];

  if (steamResult.status === "fulfilled") {
    for (const guide of steamResult.value) {
      rows.push({
        game_id: gameId,
        title: guide.title,
        url: guide.url,
        source: guide.source,
        source_type: "steam_api",
      });
    }
  } else {
    errors.push(
      steamResult.reason instanceof ExternalGuideSourceError
        ? steamResult.reason.message
        : "Falló la búsqueda de guías en Steam.",
    );
  }

  if (aiResult.status === "fulfilled") {
    for (const link of aiResult.value) {
      rows.push({
        game_id: gameId,
        title: link.title,
        url: link.url,
        source: link.source,
        source_type: "ai_search",
      });
    }
  } else {
    errors.push(
      aiResult.reason instanceof ExternalGuideSourceError
        ? aiResult.reason.message
        : "Falló la búsqueda de guías con IA.",
    );
  }

  if (rows.length === 0) {
    return { inserted: 0, errors };
  }

  const supabase = createServiceClient();
  const { error, count } = await supabase
    .from("game_external_guides")
    .upsert(rows, { onConflict: "game_id,url", ignoreDuplicates: true, count: "exact" });

  if (error) {
    errors.push(`No se pudieron guardar los enlaces encontrados: ${error.message}`);
    return { inserted: 0, errors };
  }

  return { inserted: count ?? rows.length, errors };
}
