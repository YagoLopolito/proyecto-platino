import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FriendProfile } from "@/lib/friends/queries";

type Client = SupabaseClient<Database>;

/**
 * Consultas de Perfil › Perfil y sus expandidos (epic #183, issue #196). Los
 * cálculos viven en `lib/profile/stats.ts` (puro); acá sólo se traen las filas.
 */

export interface PlatinumGame {
  gameId: string;
  name: string;
  imageUrl: string | null;
  /** `timestamptz` del trofeo de platino. */
  unlockedAt: string;
}

/**
 * Tus platinos de PSN con su fecha, el más nuevo primero. Salen de
 * `user_trophies`, que es privado (RLS "sólo el dueño"): esto sólo sirve para
 * el perfil propio, nunca para el de otro usuario.
 */
export async function getPlatinums(supabase: Client, userId: string): Promise<PlatinumGame[]> {
  const { data } = await supabase
    .from("user_trophies")
    .select("unlocked_at, trophies!inner (type, game_id, games (id, name, cover_url, icon_url))")
    .eq("user_id", userId)
    .eq("trophies.type", "platinum")
    .not("unlocked_at", "is", null)
    .order("unlocked_at", { ascending: false });

  // Un juego tiene un solo platino, pero se deduplica igual: una fila repetida
  // de un sync viejo no puede contar dos platinos.
  const seen = new Set<string>();
  return (data ?? []).flatMap((row) => {
    const game = row.trophies?.games;
    if (!game || !row.unlocked_at || seen.has(game.id)) return [];
    seen.add(game.id);
    return {
      gameId: game.id,
      name: game.name,
      imageUrl: game.cover_url ?? game.icon_url,
      unlockedAt: row.unlocked_at,
    };
  });
}

export interface ProfileCounts {
  playlist: number;
  lists: number;
  likesGiven: number;
  following: number;
  followers: number;
}

async function countRows(query: PromiseLike<{ count: number | null }>): Promise<number> {
  const { count } = await query;
  return count ?? 0;
}

/** Los contadores de las filas de "Estadísticas" que no salen del diario. */
export async function getProfileCounts(supabase: Client, userId: string): Promise<ProfileCounts> {
  const head = { count: "exact" as const, head: true };
  const [playlist, lists, reviewLikes, listLikes, following, followers] = await Promise.all([
    countRows(supabase.from("user_playlist").select("game_id", head).eq("user_id", userId)),
    countRows(supabase.from("user_lists").select("id", head).eq("user_id", userId)),
    countRows(supabase.from("review_likes").select("entry_id", head).eq("user_id", userId)),
    countRows(supabase.from("list_likes").select("list_id", head).eq("user_id", userId)),
    countRows(supabase.from("friendships").select("friend_id", head).eq("user_id", userId)),
    countRows(supabase.from("friendships").select("user_id", head).eq("friend_id", userId)),
  ]);
  return { playlist, lists, likesGiven: reviewLikes + listLikes, following, followers };
}

/**
 * Quién te sigue. La relación es unidireccional (ver migración de friends) y la
 * RLS de `friendships` deja ver las filas donde sos el agregado.
 */
export async function getFollowers(supabase: Client, userId: string): Promise<FriendProfile[]> {
  const { data: rows } = await supabase
    .from("friendships")
    .select("user_id")
    .eq("friend_id", userId);
  const ids = (rows ?? []).map((row) => row.user_id);
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("public_profiles")
    .select("id, display_name, psn_online_id, avatar_url")
    .in("id", ids);
  return (profiles ?? []).flatMap((profile) =>
    profile.id
      ? {
          id: profile.id,
          displayName: profile.display_name,
          psnOnlineId: profile.psn_online_id,
          avatarUrl: profile.avatar_url,
        }
      : [],
  );
}

export interface LikedReview {
  entryId: string;
  gameId: string;
  gameName: string;
  imageUrl: string | null;
  rating: number | null;
  review: string | null;
  authorId: string;
  likedAt: string;
}

export interface LikedList {
  listId: string;
  title: string;
  likedAt: string;
}

/** Reseñas y listas que te gustaron, lo último primero. */
export async function getLikesGiven(
  supabase: Client,
  userId: string,
): Promise<{ reviews: LikedReview[]; lists: LikedList[] }> {
  const [{ data: reviewRows }, { data: listRows }] = await Promise.all([
    supabase
      .from("review_likes")
      .select(
        "created_at, game_diary_entries (id, user_id, game_id, rating, review, games (name, cover_url, icon_url))",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("list_likes")
      .select("created_at, user_lists (id, title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    reviews: (reviewRows ?? []).flatMap((row) => {
      const entry = row.game_diary_entries;
      if (!entry?.games) return [];
      return {
        entryId: entry.id,
        gameId: entry.game_id,
        gameName: entry.games.name,
        imageUrl: entry.games.cover_url ?? entry.games.icon_url,
        rating: entry.rating,
        review: entry.review,
        authorId: entry.user_id,
        likedAt: row.created_at,
      };
    }),
    // Una lista que se volvió privada no llega (la RLS de `user_lists` la
    // esconde): simplemente no aparece.
    lists: (listRows ?? []).flatMap((row) =>
      row.user_lists
        ? { listId: row.user_lists.id, title: row.user_lists.title, likedAt: row.created_at }
        : [],
    ),
  };
}

/** Tu bio (Configuración › Perfil). */
export async function getOwnBio(supabase: Client, userId: string): Promise<string | null> {
  const { data } = await supabase.from("users").select("bio").eq("id", userId).maybeSingle();
  return data?.bio ?? null;
}
