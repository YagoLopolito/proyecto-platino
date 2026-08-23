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
 * Las dos condiciones de "lo terminé del todo" que la app detecta sola. Son
 * distintas y no se mezclan: el platino es un trofeo real de PSN que existe en
 * la lista; el 100% de Steam es una condición derivada de sus logros. Cada una
 * escribe su propia columna.
 */
type CompletionKind = "platinum" | "completion";

const KIND_CONFIG: Record<
  CompletionKind,
  { column: "platinum_earned_at" | "completed_at"; source: string }
> = {
  platinum: { column: "platinum_earned_at", source: "platinum_sync" },
  completion: { column: "completed_at", source: "completion_sync" },
};

/**
 * La columna a escribir sale como literal y no como clave computada: con una
 * clave computada, los tipos generados de Supabase no pueden validar el objeto
 * y lo rechazan entero.
 */
function completionPatch(
  kind: CompletionKind,
  value: string,
): { platinum_earned_at: string } | { completed_at: string } {
  return kind === "platinum" ? { platinum_earned_at: value } : { completed_at: value };
}

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
async function reconcileCompletionDiaryEntry(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameId: string,
  platinumEarnedAt: string,
  kind: CompletionKind,
): Promise<PlatinumDiaryOutcome> {
  const { column, source } = KIND_CONFIG[kind];
  const platinumDay = platinumEarnedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(platinumDay)) return "skipped";

  const { data: entries, error } = await supabase
    .from("game_diary_entries")
    .select(`id, finished_on, playthrough_number, ${column}`)
    .eq("user_id", userId)
    .eq("game_id", gameId);

  if (error) throw new Error(error.message);

  type EntryRow = { id: string; finished_on: string; playthrough_number: number } & Record<
    string,
    unknown
  >;
  const rows = (entries ?? []) as unknown as EntryRow[];

  if (rows.some((entry) => entry[column] != null)) {
    return "already_linked";
  }

  // La más cercana en el tiempo dentro de la ventana; con rejugadas puede
  // haber varias candidatas y la que corresponde es la de fecha más próxima.
  const candidate = rows
    .map((entry) => ({ entry, distance: daysBetween(entry.finished_on, platinumDay) }))
    .filter(({ distance }) => distance <= PLATINUM_MATCH_WINDOW_DAYS)
    .sort((a, b) => a.distance - b.distance)[0]?.entry;

  if (candidate) {
    const { error: updateError } = await supabase
      .from("game_diary_entries")
      .update({ ...completionPatch(kind, platinumEarnedAt), updated_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
    return "linked";
  }

  const nextPlaythrough = Math.max(0, ...rows.map((entry) => entry.playthrough_number)) + 1;

  const { error: insertError } = await supabase.from("game_diary_entries").insert({
    user_id: userId,
    game_id: gameId,
    playthrough_number: nextPlaythrough,
    finished_on: platinumDay,
    source,
    ...completionPatch(kind, platinumEarnedAt),
  });

  // 23505: otro sync concurrente ya insertó esa misma partida -- no es un error
  // real, la entrada existe igual.
  if (insertError && insertError.code !== "23505") {
    throw new Error(insertError.message);
  }

  return insertError ? "skipped" : "created";
}

/**
 * Auto-detección del platino de PSN. Ver la regla completa arriba.
 */
export function reconcilePlatinumDiaryEntry(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameId: string,
  platinumEarnedAt: string,
): Promise<PlatinumDiaryOutcome> {
  return reconcileCompletionDiaryEntry(supabase, userId, gameId, platinumEarnedAt, "platinum");
}

/**
 * Equivalente para Steam: el juego llegó al 100% de sus logros. Misma regla de
 * ±14 días, otro disparador y otra columna (`completed_at`).
 *
 * `completedAt` es la fecha del **último logro desbloqueado**, no la del sync:
 * si no, una biblioteca vieja quedaría toda fechada el día que sincronizaste.
 */
export function reconcileCompletedDiaryEntry(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameId: string,
  completedAt: string,
): Promise<PlatinumDiaryOutcome> {
  return reconcileCompletionDiaryEntry(supabase, userId, gameId, completedAt, "completion");
}
