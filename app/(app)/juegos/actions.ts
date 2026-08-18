"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Saca un juego de la biblioteca del usuario.
 * No borra la fila de `games`: el catálogo es compartido (viene de PSN) y
 * otros usuarios pueden tener el mismo juego.
 */
export async function removeGame(formData: FormData): Promise<void> {
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("user_games").delete().eq("user_id", user.id).eq("game_id", gameId);

  revalidatePath("/juegos");
}
