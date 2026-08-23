import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { reconcilePlatinumDiaryEntry } from "@/lib/diary/platinum";

export interface PlatinumBackfillResult {
  /** Platinos ya sincronizados que se miraron. */
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
