import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Un juego de la Playlist: lo que necesitan el póster y los órdenes. */
export interface PlaylistGame {
  id: string;
  name: string;
  imageUrl: string | null;
  releaseYear: number | null;
  timeToBeatMinutes: number | null;
  addedAt: string;
}

/**
 * La Playlist de un usuario, sin ordenar (ver `sortPlaylist`). `user_playlist`
 * es de lectura pública, así que sirve para el perfil propio y el ajeno.
 */
export async function getPlaylist(supabase: Client, userId: string): Promise<PlaylistGame[]> {
  const { data } = await supabase
    .from("user_playlist")
    .select(
      "added_at, games!inner (id, name, cover_url, icon_url, release_year, time_to_beat_minutes)",
    )
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  return (data ?? []).flatMap((row) =>
    row.games
      ? [
          {
            id: row.games.id,
            name: row.games.name,
            imageUrl: row.games.cover_url ?? row.games.icon_url,
            releaseYear: row.games.release_year,
            timeToBeatMinutes: row.games.time_to_beat_minutes,
            addedAt: row.added_at,
          },
        ]
      : [],
  );
}

/** Si el juego está en la Playlist del usuario. */
export async function isInPlaylist(
  supabase: Client,
  userId: string,
  gameId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("user_playlist")
    .select("game_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("game_id", gameId);
  return (count ?? 0) > 0;
}

/**
 * En la Playlist de cuántas de las personas que seguís está el juego ("Está en
 * la Playlist de N amigos" en la ficha). Mismo criterio que
 * `countFriendsPlaying`: los amigos son los que agregaste vos.
 */
export async function countFriendsWithInPlaylist(
  supabase: Client,
  userId: string,
  gameId: string,
): Promise<number> {
  const { data: friends } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", userId);
  const friendIds = (friends ?? []).map((row) => row.friend_id);
  if (friendIds.length === 0) return 0;

  const { count } = await supabase
    .from("user_playlist")
    .select("game_id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .in("user_id", friendIds);
  return count ?? 0;
}
