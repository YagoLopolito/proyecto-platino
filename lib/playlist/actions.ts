"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";

export type PlaylistActionResult = { error: string | null };

const gameIdSchema = z.string().uuid();

function revalidatePlaylist() {
  revalidatePath("/perfil", "layout");
  // La ficha (`/juegos/[id]`) no se revalida a propósito: el toggle del panel
  // lleva su propio estado, y revalidar la página que se está viendo hace que
  // la action espere el re-render entero de la ficha (segundos por toque).
}

/**
 * Agrega un juego a la Playlist (issue #188). Doble capa, como el resto del
 * contenido de usuario: la action escribe sólo con el usuario de la sesión y la
 * RLS de `user_playlist` exige `user_id = auth.uid()`.
 *
 * Idempotente (upsert que ignora el duplicado): el toggle es optimista y un
 * doble click no tiene por qué terminar en error.
 */
export async function addToPlaylist(gameId: string): Promise<PlaylistActionResult> {
  const parsed = gameIdSchema.safeParse(gameId);
  if (!parsed.success) return { error: "Falta el juego." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { error } = await supabase
    .from("user_playlist")
    .upsert(
      { user_id: user.id, game_id: parsed.data },
      { onConflict: "user_id,game_id", ignoreDuplicates: true },
    );
  if (error)
    return { error: dbErrorMessage("playlist", error, "No se pudo agregar a la Playlist.") };

  revalidatePlaylist();
  return { error: null };
}

export async function removeFromPlaylist(gameId: string): Promise<PlaylistActionResult> {
  const parsed = gameIdSchema.safeParse(gameId);
  if (!parsed.success) return { error: "Falta el juego." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { error } = await supabase
    .from("user_playlist")
    .delete()
    .eq("user_id", user.id)
    .eq("game_id", parsed.data);
  if (error)
    return { error: dbErrorMessage("playlist", error, "No se pudo sacar de la Playlist.") };

  revalidatePlaylist();
  return { error: null };
}
