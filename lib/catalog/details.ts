import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchGameDetails, findGameDetailsByName } from "@/lib/covers";

export interface GameCardData {
  id: string;
  name: string;
  platform: string | null;
  coverUrl: string | null;
  backgroundUrl: string | null;
  description: string | null;
  developer: string | null;
  releaseYear: number | null;
}

type GameRow = {
  id: string;
  name: string;
  platform: string | null;
  cover_url: string | null;
  icon_url: string | null;
  background_url: string | null;
  description: string | null;
  developer: string | null;
  release_year: number | null;
  external_catalog_id: string | null;
};

export const GAME_CARD_COLUMNS =
  "id, name, platform, cover_url, icon_url, background_url, description, developer, release_year, external_catalog_id";

function toCardData(game: GameRow): GameCardData {
  return {
    id: game.id,
    name: game.name,
    platform: game.platform,
    coverUrl: game.cover_url ?? game.icon_url,
    backgroundUrl: game.background_url,
    description: game.description,
    developer: game.developer,
    releaseYear: game.release_year,
  };
}

/**
 * Datos de ficha del juego (descripción, desarrolladora, año, fondo) para la
 * vista tipo Letterbox del diario. Se cachean en `games` la primera vez que
 * alguien abre la ficha: RAWG solo se consulta si la fila todavía no los tiene.
 *
 * El update puede quedar bloqueado silenciosamente por la RLS de `games` (solo
 * el dueño de la fila puede actualizarla); en ese caso igual se devuelven los
 * datos recién traídos, así el usuario ve la ficha completa aunque el juego lo
 * haya creado otro. Todo va en try/catch: es información decorativa, nunca
 * puede tirar abajo la página del diario.
 */
export async function getGameCardData(
  supabase: SupabaseClient<Database>,
  game: GameRow,
): Promise<GameCardData> {
  const base = toCardData(game);
  if (game.description !== null) return base;

  try {
    const details = game.external_catalog_id
      ? await fetchGameDetails(game.external_catalog_id)
      : await findGameDetailsByName(game.name);

    if (!details) {
      // Marca "ya buscamos y RAWG no lo tiene" para no repetir el fetch en cada
      // visita. La UI trata el string vacío igual que la ausencia de descripción.
      await supabase.from("games").update({ description: "" }).eq("id", game.id);
      return base;
    }

    const patch = {
      description: details.description ?? "",
      developer: details.developer,
      release_year: details.releaseYear,
      background_url: details.backgroundUrl,
      ...(game.cover_url === null && details.coverUrl ? { cover_url: details.coverUrl } : {}),
    };

    await supabase.from("games").update(patch).eq("id", game.id);

    return {
      ...base,
      coverUrl: base.coverUrl ?? details.coverUrl,
      backgroundUrl: details.backgroundUrl,
      description: details.description,
      developer: details.developer,
      releaseYear: details.releaseYear,
    };
  } catch {
    return base;
  }
}
