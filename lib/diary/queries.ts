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

export interface GameDiaryEntry {
  id: string;
  playthroughNumber: number;
  rating: number | null;
  review: string | null;
  finishedOn: string;
  platinumEarnedAt: string | null;
  source: string;
}

export interface GameDiarySummary {
  /** Cantidad de valoraciones por estrella (índice 0 = 1 estrella .. 4 = 5 estrellas). */
  distribution: number[];
  ratingCount: number;
  averageRating: number | null;
  ownEntries: GameDiaryEntry[];
  totalEntries: number;
}

export type GameDiarySummaryOutcome =
  | { status: "ok"; summary: GameDiarySummary }
  | { status: "error"; message: string };

/**
 * Resumen del Letterbox para un juego: distribución de valoraciones (1-5
 * estrellas) y las entradas propias del usuario. La distribución cuenta el
 * ÚLTIMO rating de cada usuario, igual criterio que la vista `game_scores`
 * (una rejugada no vale como voto extra).
 *
 * El diario es público, así que se leen las entradas de todos los usuarios;
 * funciona igual para un juego sincronizado por PSN y uno solo de catálogo,
 * porque no toca trofeos.
 */
export async function getGameDiarySummary(
  supabase: SupabaseServerClient,
  gameId: string,
  userId: string,
): Promise<GameDiarySummaryOutcome> {
  const { data, error } = await supabase
    .from("game_diary_entries")
    .select("id, user_id, playthrough_number, rating, review, finished_on, platinum_earned_at, source")
    .eq("game_id", gameId)
    .order("playthrough_number", { ascending: false });

  if (error) {
    return { status: "error", message: error.message };
  }

  const rows = data ?? [];

  // Ya vienen ordenadas por playthrough desc: la primera de cada usuario es su
  // última partida.
  const latestByUser = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.rating === null) continue;
    if (!latestByUser.has(row.user_id)) latestByUser.set(row.user_id, row);
  }

  const distribution = [0, 0, 0, 0, 0];
  let ratingSum = 0;
  for (const row of latestByUser.values()) {
    const stars = Math.min(5, Math.max(1, Math.ceil(row.rating! / 2)));
    distribution[stars - 1] += 1;
    ratingSum += row.rating!;
  }
  const ratingCount = latestByUser.size;

  return {
    status: "ok",
    summary: {
      distribution,
      ratingCount,
      averageRating: ratingCount > 0 ? ratingSum / ratingCount : null,
      totalEntries: rows.length,
      ownEntries: rows
        .filter((row) => row.user_id === userId)
        .sort((a, b) => a.playthrough_number - b.playthrough_number)
        .map((row) => ({
          id: row.id,
          playthroughNumber: row.playthrough_number,
          rating: row.rating,
          review: row.review,
          finishedOn: row.finished_on,
          platinumEarnedAt: row.platinum_earned_at,
          source: row.source,
        })),
    },
  };
}
