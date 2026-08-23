import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { DiaryTimelineEntry } from "@/lib/diary/queries";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface FriendProfile {
  id: string;
  displayName: string | null;
  psnOnlineId: string | null;
  avatarUrl: string | null;
}

/** Una entrada de diario de un amigo: lo mismo que la propia + quién la escribió. */
export interface FriendDiaryEntry extends DiaryTimelineEntry {
  author: FriendProfile;
}

export type FriendsFeedOutcome =
  | { status: "ok"; friends: FriendProfile[]; entries: FriendDiaryEntry[] }
  | { status: "error"; message: string };

/**
 * Amigos del usuario (la relación es unidireccional, tipo "seguir": ver la
 * migración 20260822010000) leídos desde `public_profiles`, la vista que
 * expone solo los datos públicos de cada cuenta.
 */
export async function getFriends(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<FriendProfile[]> {
  const { data: rows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", userId);

  const friendIds = (rows ?? []).map((row) => row.friend_id);
  if (friendIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("public_profiles")
    .select("id, display_name, psn_online_id, avatar_url")
    .in("id", friendIds);

  return (profiles ?? [])
    .filter((profile): profile is typeof profile & { id: string } => profile.id !== null)
    .map((profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      psnOnlineId: profile.psn_online_id,
      avatarUrl: profile.avatar_url,
    }));
}

/**
 * Feed "Jugados por amigos": las entradas de diario de la gente que agregaste,
 * más reciente primero. `game_diary_entries` ya es público (ver CLAUDE.md), así
 * que esto no expone nada nuevo -- solo lo filtra a tus amigos.
 */
export async function getFriendsDiaryFeed(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 50,
): Promise<FriendsFeedOutcome> {
  const friends = await getFriends(supabase, userId);
  if (friends.length === 0) {
    return { status: "ok", friends, entries: [] };
  }

  const { data, error } = await supabase
    .from("game_diary_entries")
    .select(
      "id, user_id, game_id, playthrough_number, rating, review, finished_on, completed_at, games (id, name, platform, cover_url, icon_url)",
    )
    .in(
      "user_id",
      friends.map((friend) => friend.id),
    )
    .order("finished_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { status: "error", message: error.message };
  }

  const friendsById = new Map(friends.map((friend) => [friend.id, friend]));

  return {
    status: "ok",
    friends,
    entries: (data ?? [])
      .filter((row) => row.games && friendsById.has(row.user_id))
      .map((row) => {
        const game = row.games!;
        return {
          id: row.id,
          gameId: row.game_id,
          gameName: game.name,
          platform: game.platform,
          imageUrl: game.cover_url ?? game.icon_url,
          finishedOn: row.finished_on,
          rating: row.rating,
          review: row.review,
          playthroughNumber: row.playthrough_number,
          // El badge de platino se deriva de los trofeos del usuario dueño de
          // la entrada, y `user_trophies` es privado: en el feed de amigos no
          // se puede saber, así que nunca se muestra.
          isPlatinum: false,
          // El 100% de Steam sí se puede: no se deriva de trofeos privados,
          // vive en la propia entrada de diario, que es pública.
          isCompleted: row.completed_at !== null,
          author: friendsById.get(row.user_id)!,
        };
      }),
  };
}
