import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getFriends, type FriendProfile } from "@/lib/friends/queries";
import { getReviewLikes } from "@/lib/likes/queries";
import type { LikeState } from "@/lib/likes/state";
import {
  decodeReviewCursor,
  encodeReviewCursor,
  reviewCursorFilter,
} from "@/lib/friends/review-cursor";
import { dbErrorMessage } from "@/lib/errors";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Reseñas por página de Biblioteca › Reseñas. */
export const FRIEND_REVIEWS_PAGE_SIZE = 20;

/** Una reseña de un amigo, con lo que la fila del feed necesita y nada más. */
export interface FriendReview {
  id: string;
  gameId: string;
  gameName: string;
  releaseYear: number | null;
  imageUrl: string | null;
  finishedOn: string;
  rating: number | null;
  review: string;
  playthroughNumber: number;
  author: FriendProfile;
  /** Objeto plano y no `Map`: la página también viaja como respuesta de una Server Action. */
  like: LikeState;
}

export type FriendReviewsPage =
  | { status: "ok"; friends: FriendProfile[]; reviews: FriendReview[]; nextCursor: string | null }
  | { status: "error"; message: string };

/**
 * Feed de Biblioteca › Reseñas (epic #183, issue #191): las entradas de diario
 * **con reseña escrita** de la gente que seguís, más reciente primero. Las que
 * sólo tienen rating no entran: sin texto no hay nada que leer, y van a
 * Actividad (#195).
 *
 * `game_diary_entries` y `review_likes` son públicos, así que esto no expone
 * nada nuevo: sólo lo filtra a tus amigos. El badge de platino no está ni se
 * puede derivar (sale de `user_trophies`, que es privado).
 */
export async function getFriendReviewsPage(
  supabase: SupabaseServerClient,
  userId: string,
  rawCursor: string | null = null,
  limit = FRIEND_REVIEWS_PAGE_SIZE,
): Promise<FriendReviewsPage> {
  const friends = await getFriends(supabase, userId);
  if (friends.length === 0) {
    return { status: "ok", friends, reviews: [], nextCursor: null };
  }

  let query = supabase
    .from("game_diary_entries")
    .select(
      "id, user_id, game_id, playthrough_number, rating, review, finished_on, created_at, games (name, release_year, cover_url, icon_url)",
    )
    .in(
      "user_id",
      friends.map((friend) => friend.id),
    )
    .not("review", "is", null)
    .neq("review", "")
    .order("finished_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    // Uno de más para saber si hay otra página sin pedir un `count`.
    .limit(limit + 1);

  const cursor = decodeReviewCursor(rawCursor);
  if (cursor) {
    query = query.or(reviewCursorFilter(cursor));
  }

  const { data, error } = await query;
  if (error) {
    return { status: "error", message: dbErrorMessage("friends.reviews", error) };
  }

  // El cursor sale de la última fila *pedida*, no de la última que se muestra:
  // si esa se descarta abajo (reseña de puros espacios), la siguiente página
  // igual tiene que arrancar después de ella.
  const rawPage = (data ?? []).slice(0, limit);
  const last = rawPage.at(-1);
  const pageRows = rawPage.filter((row) => row.games && row.review?.trim());
  const nextCursor =
    (data ?? []).length > limit && last
      ? encodeReviewCursor({
          finishedOn: last.finished_on,
          createdAt: last.created_at,
          id: last.id,
        })
      : null;

  const likes = await getReviewLikes(
    supabase,
    userId,
    pageRows.map((row) => row.id),
  );
  const friendsById = new Map(friends.map((friend) => [friend.id, friend]));

  return {
    status: "ok",
    friends,
    nextCursor,
    reviews: pageRows.flatMap((row) => {
      const author = friendsById.get(row.user_id);
      if (!author) return [];
      const game = row.games!;
      return {
        id: row.id,
        gameId: row.game_id,
        gameName: game.name,
        releaseYear: game.release_year,
        imageUrl: game.cover_url ?? game.icon_url,
        finishedOn: row.finished_on,
        rating: row.rating,
        review: row.review!,
        playthroughNumber: row.playthrough_number,
        author,
        like: likes.get(row.id) ?? { count: 0, liked: false },
      };
    }),
  };
}
