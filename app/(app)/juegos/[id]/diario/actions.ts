"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
    return { error: `No se pudo guardar la entrada: ${error.message}` };
  }

  revalidatePath(`/juegos/${gameId}`);
  revalidatePath(`/juegos/${gameId}/diario`);
  return { error: null, success: "Entrada guardada en el diario." };
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
    return { error: `No se pudo actualizar la entrada: ${error.message}` };
  }

  revalidatePath(`/juegos/${gameId}`);
  revalidatePath(`/juegos/${gameId}/diario`);
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

  revalidatePath(`/juegos/${gameId}`);
  revalidatePath(`/juegos/${gameId}/diario`);
}
