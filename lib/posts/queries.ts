import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getNowPlaying } from "@/lib/now-playing/queries";
import { sortGamesPlayingFirst } from "./order";

type Client = SupabaseClient<Database>;

/** Cuántos juegos de tu biblioteca se ofrecen sin buscar (los más recientes). */
const COMPOSER_RECENT_GAMES = 12;

export interface ComposerGame {
  id: string;
  name: string;
  coverUrl: string | null;
  playing: boolean;
}

/**
 * Opciones del selector de juego del compositor: lo que estás jugando
 * primero, después los últimos juegos que abriste. El resto del catálogo se
 * busca en el propio selector.
 */
export async function getComposerGames(supabase: Client, userId: string): Promise<ComposerGame[]> {
  const [playing, { data: recent }] = await Promise.all([
    getNowPlaying(supabase, userId),
    supabase
      .from("user_games")
      .select("last_played_at, games!inner (id, name, cover_url, icon_url)")
      .eq("user_id", userId)
      .order("last_played_at", { ascending: false, nullsFirst: false })
      .limit(COMPOSER_RECENT_GAMES),
  ]);

  return sortGamesPlayingFirst<ComposerGame>(
    playing.map((game) => ({
      id: game.id,
      name: game.name,
      coverUrl: game.imageUrl,
      playing: true,
    })),
    (recent ?? []).flatMap((row) =>
      row.games
        ? [
            {
              id: row.games.id,
              name: row.games.name,
              coverUrl: row.games.cover_url ?? row.games.icon_url,
              playing: false,
            },
          ]
        : [],
    ),
  );
}

/** Un juego por id, para preseleccionarlo (`/publicaciones/nueva?juego=`). */
export async function getComposerGame(
  supabase: Client,
  gameId: string,
): Promise<ComposerGame | null> {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) return null;
  const { data } = await supabase
    .from("games")
    .select("id, name, cover_url, icon_url")
    .eq("id", gameId)
    .maybeSingle();
  return data
    ? { id: data.id, name: data.name, coverUrl: data.cover_url ?? data.icon_url, playing: false }
    : null;
}
