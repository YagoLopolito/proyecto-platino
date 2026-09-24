import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { IgdbStudioGame } from "@/lib/igdb";
import { getPlayedGameIds } from "@/lib/lists/queries";
import type { SortableStudioGame } from "./sort";

export interface StudioGameItem extends SortableStudioGame {
  igdbId: number;
  coverUrl: string | null;
  /** La ficha si el juego ya está en `games`; si no, la ruta que lo materializa. */
  href: string;
  played: boolean;
}

/**
 * Cruza los juegos de IGDB de un estudio con la base: cuáles ya tienen ficha
 * (por `games.igdb_id`), cuáles jugó quien mira y su puntuación en Platinoob.
 *
 * Un mismo juego puede ser dos filas (PSN y Steam): cuenta como jugado si lo
 * jugaste en cualquiera, y la ficha es la más vieja.
 */
export async function resolveStudioGames(
  supabase: SupabaseClient<Database>,
  viewerId: string,
  games: IgdbStudioGame[],
): Promise<StudioGameItem[]> {
  const igdbIds = games.map((game) => game.igdbId);
  const { data: rows } = igdbIds.length
    ? await supabase
        .from("games")
        .select("id, igdb_id, cover_url, icon_url")
        .in("igdb_id", igdbIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const byIgdb = new Map<number, { ids: string[]; cover: string | null }>();
  for (const row of rows ?? []) {
    if (row.igdb_id === null) continue;
    const entry = byIgdb.get(row.igdb_id) ?? { ids: [], cover: row.cover_url ?? row.icon_url };
    entry.ids.push(row.id);
    byIgdb.set(row.igdb_id, entry);
  }

  const gameIds = [...byIgdb.values()].flatMap((entry) => entry.ids);
  const [played, { data: scores }] = await Promise.all([
    getPlayedGameIds(supabase, viewerId, gameIds),
    gameIds.length
      ? supabase.from("game_scores").select("game_id, average_rating").in("game_id", gameIds)
      : Promise.resolve({ data: [] as { game_id: string | null; average_rating: number | null }[] }),
  ]);
  const scoreById = new Map((scores ?? []).map((row) => [row.game_id, row.average_rating]));

  return games.map((game) => {
    const entry = byIgdb.get(game.igdbId);
    const ids = entry?.ids ?? [];
    const score = ids
      .map((id) => scoreById.get(id) ?? null)
      .find((value): value is number => value !== null);
    return {
      igdbId: game.igdbId,
      name: game.name,
      year: game.year,
      coverUrl: game.coverUrl ?? entry?.cover ?? null,
      href: ids[0] ? `/juegos/${ids[0]}` : `/juegos/igdb/${game.igdbId}`,
      played: ids.some((id) => played.has(id)),
      score: score ?? null,
    };
  });
}
