import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Saca un juego de la Playlist si estaba (epic #183, issue #188). Lo llaman
 * "Jugando ahora" y registrar una partida: empezar a jugar o terminar un juego
 * es dejar de "querer jugarlo", igual que Letterboxd saca de la watchlist la
 * película que marcaste como vista.
 *
 * Devuelve si efectivamente había algo que sacar, para que la UI avise
 * ("Sacado de tu Playlist") sólo cuando pasó. Nunca tira: es un extra sobre
 * la acción principal, que ya se guardó.
 */
export async function removeFromPlaylistIfPresent(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_playlist")
    .delete()
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .select("game_id");
  if (error) {
    console.error(`[playlist] no se pudo sacar ${gameId} de la playlist:`, error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
