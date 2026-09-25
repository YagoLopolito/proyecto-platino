"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { endNowPlaying } from "@/lib/now-playing/end";
import { removeFromPlaylistIfPresent } from "@/lib/playlist/remove";
import {
  getNowPlaying,
  getPlaySuggestion,
  type NowPlayingGame,
  type PlaySuggestion,
} from "@/lib/now-playing/queries";

export type NowPlayingActionResult = {
  error: string | null;
  /** Empezar a jugarlo lo sacó de la Playlist (issue #188): la UI lo avisa. */
  removedFromPlaylist?: boolean;
};

const gameIdSchema = z.string().uuid();

/** Todo lo que muestra "Jugando ahora": perfil, biblioteca y la ficha. */
function revalidateNowPlaying() {
  // "layout": el perfil propio tiene sub-tabs (la Playlist, #188).
  revalidatePath("/perfil", "layout");
  revalidatePath("/biblioteca");
  // La ficha (`/juegos/[id]`) no se revalida a propósito: el toggle del panel
  // lleva su propio estado, y revalidar la página que se está viendo hace que
  // la action espere el re-render entero de la ficha (segundos por toque).
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Marca un juego como "jugando ahora" (issue #187). Doble capa, como el resto
 * del contenido de usuario: la action sólo escribe filas del usuario de la
 * sesión, y la RLS de `now_playing` exige `user_id = auth.uid()`.
 *
 * Además lo vincula a `user_games` si no estaba (mismo criterio que registrar
 * una partida): desde la ficha se puede marcar cualquier juego del catálogo, y
 * lo que estás jugando es parte de tu biblioteca.
 *
 * Y lo saca de la Playlist (#188): si lo estás jugando, ya no es un juego que
 * "querés jugar".
 */
export async function startPlaying(gameId: string): Promise<NowPlayingActionResult> {
  const parsed = gameIdSchema.safeParse(gameId);
  if (!parsed.success) return { error: "Falta el juego." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { error } = await supabase
    .from("now_playing")
    .insert({ user_id: user.id, game_id: parsed.data });

  if (error) {
    // El unique parcial de rachas abiertas: ya lo estás jugando.
    if (error.code === "23505") return { error: "Ya lo estás jugando." };
    return { error: `No se pudo marcar como jugando: ${error.message}` };
  }

  const [, removedFromPlaylist] = await Promise.all([
    supabase
      .from("user_games")
      .upsert(
        { user_id: user.id, game_id: parsed.data },
        { onConflict: "user_id,game_id", ignoreDuplicates: true },
      ),
    removeFromPlaylistIfPresent(supabase, user.id, parsed.data),
  ]);

  revalidateNowPlaying();
  return { error: null, removedFromPlaylist };
}

/** "Dejé de jugarlo": cierra la racha abierta con `end_reason = 'manual'`. */
export async function stopPlaying(gameId: string): Promise<NowPlayingActionResult> {
  const parsed = gameIdSchema.safeParse(gameId);
  if (!parsed.success) return { error: "Falta el juego." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { error } = await endNowPlaying(supabase, user.id, parsed.data, "manual");
  if (error) return { error: `No se pudo actualizar: ${error}` };

  revalidateNowPlaying();
  return { error: null };
}

/**
 * "Descartar" en el banner de sugerencia de la biblioteca. Guarda el
 * `last_played_at` que tenía el juego al descartarlo (no la hora actual): el
 * juego se vuelve a sugerir recién cuando el sync traiga uno posterior, o sea
 * una sesión nueva. Con la hora actual, un `last_played_at` que el sync
 * aproxima con el momento del sync (Steam) podía quedar después del descarte
 * y la sugerencia no se iba.
 */
export async function dismissPlaySuggestion(gameId: string): Promise<NowPlayingActionResult> {
  const parsed = gameIdSchema.safeParse(gameId);
  if (!parsed.success) return { error: "Falta el juego." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { data: row } = await supabase
    .from("user_games")
    .select("last_played_at")
    .eq("user_id", user.id)
    .eq("game_id", parsed.data)
    .maybeSingle();

  const { error } = await supabase
    .from("user_games")
    .update({ play_suggestion_dismissed_at: row?.last_played_at ?? new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("game_id", parsed.data);
  if (error) return { error: `No se pudo descartar: ${error.message}` };

  revalidatePath("/biblioteca");
  return { error: null };
}

export type RegisterContext =
  | { status: "ok"; suggestion: PlaySuggestion | null; playing: NowPlayingGame[] }
  | { status: "error"; message: string };

/**
 * Lo que necesita el menú del + al abrirse: el juego a sugerir ("¿Estás
 * jugando X?") y los que ya estás jugando (para preseleccionarlos al registrar
 * uno terminado). Se pide al abrir y no en el layout: el + está en todas las
 * pantallas y no tiene sentido pagar estas consultas en cada navegación.
 */
export async function getRegisterContext(): Promise<RegisterContext> {
  const { supabase, user } = await requireUser();
  if (!user) return { status: "error", message: "Tenés que iniciar sesión." };

  const [suggestion, playing] = await Promise.all([
    getPlaySuggestion(supabase, user.id),
    getNowPlaying(supabase, user.id),
  ]);
  return { status: "ok", suggestion, playing };
}
