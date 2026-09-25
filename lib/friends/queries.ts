import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface FriendProfile {
  id: string;
  displayName: string | null;
  profileName: string | null;
  avatarUrl: string | null;
}

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
    .select("id, display_name, profile_name, profile_avatar_url")
    .in("id", friendIds);

  return (profiles ?? [])
    .filter((profile): profile is typeof profile & { id: string } => profile.id !== null)
    .map((profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      profileName: profile.profile_name,
      avatarUrl: profile.profile_avatar_url,
    }));
}
