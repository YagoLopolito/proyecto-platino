import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type NowPlayingEndReason = "manual" | "platinum" | "completion" | "diary_entry";

/**
 * Cierra la racha abierta de "Jugando ahora" de un juego (epic #183, issue
 * #187). Si no había ninguna, no hace nada.
 *
 * `achievedAt` es para las salidas automáticas del sync: el platino (o el
 * 100%) sólo cierra una racha que **empezó antes** de conseguirlo. Sin eso,
 * marcar como jugando un juego que ya platinaste (para rejugarlo) duraría
 * hasta el siguiente sync, que vería el platino viejo y lo sacaría solo.
 *
 * Devuelve el error de Supabase en vez de tirarlo: los callers del sync lo
 * llaman dentro de su try/catch, pero una Server Action decide si lo muestra.
 */
export async function endNowPlaying(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameId: string,
  reason: NowPlayingEndReason,
  options: { achievedAt?: string } = {},
): Promise<{ error: string | null }> {
  let query = supabase
    .from("now_playing")
    .update({ ended_at: new Date().toISOString(), end_reason: reason })
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .is("ended_at", null);

  if (options.achievedAt) {
    query = query.lte("started_at", options.achievedAt);
  }

  const { error } = await query;
  return { error: error?.message ?? null };
}
