"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Marca un trofeo como obtenido ahora. La fecha exacta no se le pide al usuario. */
export async function markTrophyObtained(formData: FormData): Promise<void> {
  const trophyId = String(formData.get("trophyId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!trophyId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("user_trophies")
    .upsert(
      { user_id: user.id, trophy_id: trophyId, unlocked_at: new Date().toISOString() },
      { onConflict: "user_id,trophy_id" },
    );

  revalidatePath(`/juegos/${gameId}`);
  revalidatePath("/juegos");
}

export async function unmarkTrophyObtained(formData: FormData): Promise<void> {
  const trophyId = String(formData.get("trophyId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!trophyId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("user_trophies")
    .delete()
    .eq("user_id", user.id)
    .eq("trophy_id", trophyId);

  revalidatePath(`/juegos/${gameId}`);
  revalidatePath("/juegos");
}
