import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { reconcileCompletedDiaryEntry, reconcilePlatinumDiaryEntry } from "@/lib/diary/platinum";

export interface PlatinumBackfillResult {
  /** Platinos de PSN y juegos de Steam al 100% ya sincronizados que se miraron. */
  platinumsFound: number;
  /** Entradas nuevas creadas (no había ninguna partida cargada de ese juego). */
  created: number;
  /** Entradas que ya existían y quedaron marcadas con la fecha del platino. */
  linked: number;
}

/**
 * Carga en el diario los platinos VIEJOS: los que ya están en `user_trophies`
 * de syncs anteriores pero nunca pasaron por la auto-detección (que corre
 * dentro del sync, así que solo alcanza a los platinos vistos después de
 * implementarla, issue #96).
 *
 * No llama a PSN: la fecha de desbloqueo ya está guardada localmente. Aplica
 * exactamente la misma regla de negocio (`reconcilePlatinumDiaryEntry`), así
 * que es idempotente -- correrlo dos veces no duplica entradas.
 */
export async function backfillPlatinumDiaryEntries(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PlatinumBackfillResult> {
  const { data, error } = await supabase
    .from("user_trophies")
    .select("unlocked_at, trophies!inner (game_id, type)")
    .eq("user_id", userId)
    .eq("trophies.type", "platinum");

  if (error) throw new Error(error.message);

  const platinums = (data ?? [])
    .filter((row) => row.unlocked_at && row.trophies)
    .map((row) => ({ gameId: row.trophies!.game_id, unlockedAt: row.unlocked_at! }));

  const result: PlatinumBackfillResult = {
    platinumsFound: platinums.length,
    created: 0,
    linked: 0,
  };

  // En serie a propósito: son pocas filas (un platino por juego platinado) y
  // así dos juegos no compiten por el mismo `playthrough_number`.
  for (const platinum of platinums) {
    const outcome = await reconcilePlatinumDiaryEntry(
      supabase,
      userId,
      platinum.gameId,
      platinum.unlockedAt,
    );
    if (outcome === "created") result.created += 1;
    if (outcome === "linked") result.linked += 1;
  }

  return result;
}

/**
 * El equivalente del backfill para Steam: juegos ya sincronizados que están al
 * 100% de sus logros pero nunca pasaron por la auto-detección (porque se
 * sincronizaron antes de que existiera).
 *
 * Tampoco llama a Steam: las fechas de desbloqueo ya están en `user_trophies`.
 * La condición del 100% se calcula acá comparando los logros del juego contra
 * los que el usuario tiene -- no existe un "trofeo de 100%" que buscar, a
 * diferencia del platino.
 */
export async function backfillCompletedDiaryEntries(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PlatinumBackfillResult> {
  // Dos queries planas en vez de un embed anidado: es el mismo patrón que usa
  // getPlatinumGameIds en lib/diary/queries.ts, y evita depender de cómo
  // PostgREST resuelve un embed con RLS de por medio.
  const { data: achievements, error } = await supabase
    .from("trophies")
    .select("id, game_id, games!inner (source)")
    .eq("type", "achievement")
    .eq("games.source", "steam");

  if (error) throw new Error(error.message);

  const trophyIds = (achievements ?? []).map((row) => row.id);
  if (trophyIds.length === 0) {
    return { platinumsFound: 0, created: 0, linked: 0 };
  }

  const { data: unlocked, error: unlockedError } = await supabase
    .from("user_trophies")
    .select("trophy_id, unlocked_at")
    .eq("user_id", userId)
    .in("trophy_id", trophyIds);

  if (unlockedError) throw new Error(unlockedError.message);

  const unlockedById = new Map((unlocked ?? []).map((row) => [row.trophy_id, row.unlocked_at]));

  type GameProgress = { total: number; earned: number; lastUnlockedAt: string | null };
  const byGame = new Map<string, GameProgress>();

  for (const row of achievements ?? []) {
    const progress = byGame.get(row.game_id) ?? { total: 0, earned: 0, lastUnlockedAt: null };
    progress.total += 1;

    if (unlockedById.has(row.id)) {
      progress.earned += 1;
      const unlockedAt = unlockedById.get(row.id) ?? null;
      if (unlockedAt && (!progress.lastUnlockedAt || unlockedAt > progress.lastUnlockedAt)) {
        progress.lastUnlockedAt = unlockedAt;
      }
    }
    byGame.set(row.game_id, progress);
  }

  const completed = [...byGame.entries()].filter(
    ([, progress]) => progress.total > 0 && progress.earned === progress.total && progress.lastUnlockedAt,
  );

  const result: PlatinumBackfillResult = { platinumsFound: completed.length, created: 0, linked: 0 };

  // En serie por lo mismo que el backfill de platinos: así dos juegos no
  // compiten por el mismo `playthrough_number`.
  for (const [gameId, progress] of completed) {
    const outcome = await reconcileCompletedDiaryEntry(
      supabase,
      userId,
      gameId,
      progress.lastUnlockedAt!,
    );
    if (outcome === "created") result.created += 1;
    if (outcome === "linked") result.linked += 1;
  }

  return result;
}
