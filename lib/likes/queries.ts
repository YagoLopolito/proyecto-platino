import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { LikeState } from "@/lib/likes/state";

export { likeStateOf, type LikeState } from "@/lib/likes/state";

type Client = SupabaseClient<Database>;

function aggregate(
  rows: { user_id: string; target: string }[],
  viewerId: string | null,
): Map<string, LikeState> {
  const byTarget = new Map<string, LikeState>();
  for (const row of rows) {
    const current = byTarget.get(row.target) ?? { count: 0, liked: false };
    byTarget.set(row.target, {
      count: current.count + 1,
      liked: current.liked || row.user_id === viewerId,
    });
  }
  return byTarget;
}

/**
 * Likes de un conjunto de reseñas (epic #183, issue #190). Se cuentan en la
 * query y no en una columna: con este volumen alcanza, y no hay un contador
 * denormalizado que pueda divergir de las filas.
 */
export async function getReviewLikes(
  supabase: Client,
  viewerId: string | null,
  entryIds: string[],
): Promise<Map<string, LikeState>> {
  if (entryIds.length === 0) return new Map();
  const { data } = await supabase
    .from("review_likes")
    .select("user_id, entry_id")
    .in("entry_id", entryIds);
  return aggregate(
    (data ?? []).map((row) => ({ user_id: row.user_id, target: row.entry_id })),
    viewerId,
  );
}

/** Likes de un conjunto de listas. La RLS no devuelve los de una lista privada ajena. */
export async function getListLikes(
  supabase: Client,
  viewerId: string | null,
  listIds: string[],
): Promise<Map<string, LikeState>> {
  if (listIds.length === 0) return new Map();
  const { data } = await supabase
    .from("list_likes")
    .select("user_id, list_id")
    .in("list_id", listIds);
  return aggregate(
    (data ?? []).map((row) => ({ user_id: row.user_id, target: row.list_id })),
    viewerId,
  );
}
