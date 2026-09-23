import Link from "next/link";
import EditDiaryEntryForm from "@/components/diary/EditDiaryEntryForm";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { getFriends } from "@/lib/friends/queries";
import { profileLabel } from "@/lib/friends/constants";
import { getGamePageBase } from "@/lib/game-page/data";
import { getReviewLikes, likeStateOf, type LikeState } from "@/lib/likes/queries";
import { LikeButton } from "@/components/likes/LikeButton";

type ReviewEntry = {
  id: string;
  user_id: string;
  playthrough_number: number;
  rating: number | null;
  review: string | null;
  finished_on: string;
  source: string;
  platinum_earned_at: string | null;
  completed_at: string | null;
};

/**
 * Tab Reseñas de la ficha (la default). Lo que antes era la ficha de diario:
 * tus partidas (editables) y las de los demás, con las de tus amigos primero
 * -- como Letterboxd, donde lo que opinó tu gente pesa más que un desconocido.
 * El score comunitario y su histograma viven en el panel de acciones.
 *
 * El diario es público (a diferencia de `user_trophies`), así que esta tab
 * funciona igual para un juego que no está en tu biblioteca.
 */
export default async function GameReviewsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = await params;
  const { supabase, userId } = await getGamePageBase(gameId);

  const [{ data, error }, friends] = await Promise.all([
    supabase
      .from("game_diary_entries")
      .select(
        "id, user_id, playthrough_number, rating, review, finished_on, source, platinum_earned_at, completed_at",
      )
      .eq("game_id", gameId)
      .order("finished_on", { ascending: false }),
    getFriends(supabase, userId),
  ]);

  const entries: ReviewEntry[] = data ?? [];
  const own = entries
    .filter((entry) => entry.user_id === userId)
    .sort((a, b) => b.playthrough_number - a.playthrough_number);
  const friendIds = new Set(friends.map((friend) => friend.id));
  const fromFriends = entries.filter((entry) => friendIds.has(entry.user_id));
  const fromOthers = entries.filter(
    (entry) => entry.user_id !== userId && !friendIds.has(entry.user_id),
  );

  // Nombres de quien reseñó: `public_profiles` expone sólo lo público de cada
  // cuenta (ver la sección de amigos de CLAUDE.md).
  const authorIds = [...new Set([...fromFriends, ...fromOthers].map((entry) => entry.user_id))];
  const [{ data: profiles }, likes] = await Promise.all([
    authorIds.length
      ? supabase
          .from("public_profiles")
          .select("id, display_name, psn_online_id")
          .in("id", authorIds)
      : Promise.resolve({ data: [] }),
    getReviewLikes(
      supabase,
      userId,
      entries.map((entry) => entry.id),
    ),
  ]);
  const nameById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profileLabel({ displayName: profile.display_name, psnOnlineId: profile.psn_online_id }),
    ]),
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6">
      {error && <ErrorState message={`No se pudieron cargar las reseñas: ${error.message}`} />}

      {!error && own.length > 0 && (
        <section className="space-y-2">
          <SectionHeader title="Tus partidas" />
          {own.map((entry) => (
            <EditDiaryEntryForm
              key={entry.id}
              gameId={gameId}
              entry={entry}
              likeCount={likeStateOf(likes, entry.id).count}
            />
          ))}
        </section>
      )}

      {!error && fromFriends.length > 0 && (
        <ReviewList title="De tus amigos" entries={fromFriends} nameById={nameById} likes={likes} />
      )}

      {!error && fromOthers.length > 0 && (
        <ReviewList
          title={fromFriends.length > 0 ? "Del resto de la comunidad" : "De la comunidad"}
          entries={fromOthers}
          nameById={nameById}
          likes={likes}
        />
      )}

      {!error && entries.length === 0 && (
        <EmptyState
          icon="book"
          title="Todavía nadie registró este juego."
          description="Registrá tu partida desde “Registrar o puntuar” y sé el primero."
        />
      )}
    </div>
  );
}

/** Reseñas de otros: filas con hairline, la reseña en la serif de lectura. */
function ReviewList({
  title,
  entries,
  nameById,
  likes,
}: {
  title: string;
  entries: ReviewEntry[];
  nameById: Map<string | null, string>;
  likes: Map<string, LikeState>;
}) {
  return (
    <section className="space-y-2">
      <SectionHeader title={title} />
      <ul>
        {entries.map((entry) => {
          const author = nameById.get(entry.user_id) ?? "Usuario sin nombre";
          const like = likeStateOf(likes, entry.id);
          return (
            <li key={entry.id} className="border-t border-border py-3 first:border-t-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-ink-muted">
                <Link
                  href={`/perfil/${entry.user_id}`}
                  className="font-semibold text-ink hover:text-accent-ink hover:underline"
                >
                  {author}
                </Link>
                <StarRatingDisplay rating={entry.rating} tone="others" />
                <span>
                  Partida #{entry.playthrough_number} · {entry.finished_on}
                </span>
                {entry.platinum_earned_at && (
                  <Icon name="trophy" className="h-4 w-4 text-trophy-platinum" label="Platinado" />
                )}
                {entry.completed_at && (
                  <Icon
                    name="completed"
                    className="h-4 w-4 text-success"
                    label="Completado al 100%"
                  />
                )}
              </p>
              {entry.review && (
                <p className="mt-1.5 whitespace-pre-line break-words type-review text-ink">
                  {entry.review}
                </p>
              )}
              <div className="mt-1.5">
                <LikeButton
                  kind="review"
                  targetId={entry.id}
                  liked={like.liked}
                  count={like.count}
                  label={`Me gusta la reseña de ${author}`}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
