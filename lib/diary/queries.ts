import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface DiaryTimelineEntry {
  id: string;
  gameId: string;
  gameName: string;
  platform: string | null;
  imageUrl: string | null;
  finishedOn: string;
  rating: number | null;
  review: string | null;
  playthroughNumber: number;
  isPlatinum: boolean;
}

export type DiaryTimelineOutcome =
  | { status: "ok"; entries: DiaryTimelineEntry[] }
  | { status: "error"; message: string };

/**
 * Entradas del diario del usuario, más reciente primero, con los datos del
 * juego y si tiene el platino desbloqueado. El platino no vive en
 * `game_diary_entries` (la tabla no tiene `is_platinum`): se deriva de los
 * trofeos ya sincronizados, así una entrada de un juego de catálogo sin
 * trofeos simplemente queda sin badge.
 */
export async function getUserDiaryEntries(
  supabase: SupabaseServerClient,
  userId: string,
  limit?: number,
): Promise<DiaryTimelineOutcome> {
  let query = supabase
    .from("game_diary_entries")
    .select(
      "id, game_id, playthrough_number, rating, review, finished_on, games (id, name, platform, cover_url, icon_url)",
    )
    .eq("user_id", userId)
    .order("finished_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    return { status: "error", message: error.message };
  }

  const rows = (data ?? []).filter((row) => row.games);
  const gameIds = Array.from(new Set(rows.map((row) => row.game_id)));
  const platinumGameIds = await getPlatinumGameIds(supabase, userId, gameIds);

  return {
    status: "ok",
    entries: rows.map((row) => {
      const game = row.games!;
      return {
        id: row.id,
        gameId: row.game_id,
        gameName: game.name,
        platform: game.platform,
        imageUrl: game.cover_url ?? game.icon_url,
        finishedOn: row.finished_on,
        rating: row.rating,
        review: row.review,
        playthroughNumber: row.playthrough_number,
        isPlatinum: platinumGameIds.has(row.game_id),
      };
    }),
  };
}

async function getPlatinumGameIds(
  supabase: SupabaseServerClient,
  userId: string,
  gameIds: string[],
): Promise<Set<string>> {
  if (gameIds.length === 0) return new Set();

  const { data: platinumTrophies } = await supabase
    .from("trophies")
    .select("id, game_id")
    .eq("type", "platinum")
    .in("game_id", gameIds);

  const trophyIds = (platinumTrophies ?? []).map((trophy) => trophy.id);
  if (trophyIds.length === 0) return new Set();

  const { data: unlocked } = await supabase
    .from("user_trophies")
    .select("trophy_id")
    .eq("user_id", userId)
    .in("trophy_id", trophyIds);

  const gameByTrophyId = new Map((platinumTrophies ?? []).map((t) => [t.id, t.game_id] as const));
  const out = new Set<string>();
  for (const row of unlocked ?? []) {
    const gameId = gameByTrophyId.get(row.trophy_id);
    if (gameId) out.add(gameId);
  }
  return out;
}
