"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { endNowPlaying } from "@/lib/now-playing/end";
import { removeFromPlaylistIfPresent } from "@/lib/playlist/remove";
import { dbErrorMessage } from "@/lib/errors";

export type DiaryActionState = { error: string | null; success?: string | null };

const RATING_ERROR = "El rating tiene que ser un número entre 0 y 10.";
const DATE_ERROR = "Elegí una fecha válida.";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseRating(
  raw: FormDataEntryValue | null,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 10) return { ok: false };
  return { ok: true, value };
}

async function nextPlaythroughNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  gameId: string,
): Promise<number> {
  const { data } = await supabase
    .from("game_diary_entries")
    .select("playthrough_number")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .order("playthrough_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.playthrough_number ?? 0) + 1;
}

export async function createDiaryEntry(
  _prevState: DiaryActionState,
  formData: FormData,
): Promise<DiaryActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const finishedOn = String(formData.get("finishedOn") ?? "");
  const review = String(formData.get("review") ?? "").trim();

  if (!gameId) {
    return { error: "Falta el juego." };
  }
  if (!DATE_PATTERN.test(finishedOn)) {
    return { error: DATE_ERROR };
  }
  const rating = parseRating(formData.get("rating"));
  if (!rating.ok) {
    return { error: RATING_ERROR };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const playthroughNumber = await nextPlaythroughNumber(supabase, user.id, gameId);

  const { error } = await supabase.from("game_diary_entries").insert({
    user_id: user.id,
    game_id: gameId,
    playthrough_number: playthroughNumber,
    rating: rating.value,
    review: review || null,
    // finished_on es una columna `date` y viene tal cual de un <input type="date">
    // (fecha local del usuario) -- no convertir con Date/toISOString acá.
    finished_on: finishedOn,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya se guardó esta partida, recargá la página e intentá de nuevo." };
    }
    return { error: dbErrorMessage("diary", error, "No se pudo guardar la entrada.") };
  }

  // Desde el epic #183 cualquier juego tiene ficha, esté o no en tu
  // biblioteca. Abrirla no lo agrega (ver `materializeCatalogGame`), pero
  // registrar una partida sí: es el mismo criterio que `addCatalogGame`. Si ya
  // estaba vinculado, el upsert no hace nada.
  await supabase
    .from("user_games")
    .upsert(
      { user_id: user.id, game_id: gameId },
      { onConflict: "user_id,game_id", ignoreDuplicates: true },
    );

  // Registrar la partida es terminarla: sale de "Jugando ahora" (issue #187).
  // Si falla no se le avisa al usuario -- la entrada ya se guardó, que es lo
  // que pidió --, se loguea.
  // Y de la Playlist (#188): un juego terminado ya no es uno que querés jugar.
  const [ended, removedFromPlaylist] = await Promise.all([
    endNowPlaying(supabase, user.id, gameId, "diary_entry"),
    removeFromPlaylistIfPresent(supabase, user.id, gameId),
  ]);
  if (ended.error) {
    console.error(`[diario] no se pudo cerrar "jugando ahora" (${gameId}):`, ended.error);
  }

  // La ficha es un layout con tres tabs: "layout" las revalida a todas.
  revalidatePath(`/juegos/${gameId}`, "layout");
  revalidatePath("/perfil", "layout");
  revalidatePath("/biblioteca");
  return {
    error: null,
    success: removedFromPlaylist
      ? "Entrada guardada en el diario. Sacado de tu Playlist."
      : "Entrada guardada en el diario.",
  };
}

export async function updateDiaryEntry(
  _prevState: DiaryActionState,
  formData: FormData,
): Promise<DiaryActionState> {
  const entryId = String(formData.get("entryId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const finishedOn = String(formData.get("finishedOn") ?? "");
  const review = String(formData.get("review") ?? "").trim();

  if (!entryId || !gameId) {
    return { error: "Falta la entrada." };
  }
  if (!DATE_PATTERN.test(finishedOn)) {
    return { error: DATE_ERROR };
  }
  const rating = parseRating(formData.get("rating"));
  if (!rating.ok) {
    return { error: RATING_ERROR };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const { error } = await supabase
    .from("game_diary_entries")
    .update({
      rating: rating.value,
      review: review || null,
      finished_on: finishedOn,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) {
    return { error: dbErrorMessage("diary", error, "No se pudo actualizar la entrada.") };
  }

  // La ficha es un layout con tres tabs: "layout" las revalida a todas.
  revalidatePath(`/juegos/${gameId}`, "layout");
  return { error: null, success: "Entrada actualizada." };
}

export async function deleteDiaryEntry(formData: FormData): Promise<void> {
  const entryId = String(formData.get("entryId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!entryId || !gameId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("game_diary_entries").delete().eq("id", entryId).eq("user_id", user.id);

  // La ficha es un layout con tres tabs: "layout" las revalida a todas.
  revalidatePath(`/juegos/${gameId}`, "layout");
}
