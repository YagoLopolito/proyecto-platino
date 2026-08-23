import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Ventana de tolerancia entre la fecha que cargó el usuario a mano
 * (`finished_on`) y la fecha real del platino según PSN. Dos semanas cubren el
 * caso normal (terminás el juego, el platino cae unos días después limpiando
 * coleccionables) sin llegar a pegarle a una rejugada distinta.
 */
export const PLATINUM_MATCH_WINDOW_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Diferencia en días entre dos fechas `YYYY-MM-DD` (ambas se leen como UTC). */
function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / MS_PER_DAY);
}

export type PlatinumDiaryOutcome = "linked" | "created" | "already_linked" | "skipped";

/**
 * Regla de negocio del híbrido terminado/platino (issue #96): si el usuario ya
 * tiene una entrada de diario de ese juego con `finished_on` dentro de
 * ±PLATINUM_MATCH_WINDOW_DAYS de la fecha del platino, se le pega la fecha real
 * del platino a esa entrada; si no hay ninguna cercana, se crea una entrada
 * nueva con `source = 'platinum_sync'`.
 *
 * Nunca pisa el rating ni la reseña del usuario: solo escribe
 * `platinum_earned_at`. El caller (el sync de PSN) la invoca dentro de un
 * try/catch -- esto es un extra, no puede tirar abajo la sincronización de
 * trofeos.
 */
export async function reconcilePlatinumDiaryEntry(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameId: string,
  platinumEarnedAt: string,
): Promise<PlatinumDiaryOutcome> {
  const platinumDay = platinumEarnedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(platinumDay)) return "skipped";

  const { data: entries, error } = await supabase
    .from("game_diary_entries")
    .select("id, finished_on, platinum_earned_at, playthrough_number")
    .eq("user_id", userId)
    .eq("game_id", gameId);

  if (error) throw new Error(error.message);

  if ((entries ?? []).some((entry) => entry.platinum_earned_at !== null)) {
    return "already_linked";
  }

  // La más cercana en el tiempo dentro de la ventana; con rejugadas puede
  // haber varias candidatas y la que corresponde es la de fecha más próxima.
  const candidate = (entries ?? [])
    .map((entry) => ({ entry, distance: daysBetween(entry.finished_on, platinumDay) }))
    .filter(({ distance }) => distance <= PLATINUM_MATCH_WINDOW_DAYS)
    .sort((a, b) => a.distance - b.distance)[0]?.entry;

  if (candidate) {
    const { error: updateError } = await supabase
      .from("game_diary_entries")
      .update({ platinum_earned_at: platinumEarnedAt, updated_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
    return "linked";
  }

  const nextPlaythrough =
    Math.max(0, ...(entries ?? []).map((entry) => entry.playthrough_number)) + 1;

  const { error: insertError } = await supabase.from("game_diary_entries").insert({
    user_id: userId,
    game_id: gameId,
    playthrough_number: nextPlaythrough,
    finished_on: platinumDay,
    source: "platinum_sync",
    platinum_earned_at: platinumEarnedAt,
  });

  // 23505: otro sync concurrente ya insertó esa misma partida -- no es un error
  // real, la entrada existe igual.
  if (insertError && insertError.code !== "23505") {
    throw new Error(insertError.message);
  }

  return insertError ? "skipped" : "created";
}
