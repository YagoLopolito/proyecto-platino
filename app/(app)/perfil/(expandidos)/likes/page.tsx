import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";
import { GamePoster } from "@/components/game/GamePoster";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { Icon } from "@/components/ui/Icon";
import { ProfileSubpage } from "@/components/profile/ProfileSubpage";
import { getLikesGiven } from "@/lib/profile/overview";
import { reviewFocusHref } from "@/lib/game-page/review-focus";

export const metadata = { title: "Likes" };

/** Reseñas y listas que te gustaron (issue #196), lo último primero. */
export default async function LikesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { reviews, lists } = await getLikesGiven(supabase, user.id);
  const total = reviews.length + lists.length;

  return (
    <ProfileSubpage title="Likes" subtitle={total === 1 ? "1 me gusta" : `${total} me gusta`}>
      <section className="space-y-3" aria-labelledby="liked-reviews-heading">
        <SectionHeader title={<span id="liked-reviews-heading">Reseñas</span>} />
        {reviews.length === 0 ? (
          <EmptyState icon="heart-outline" title="Todavía no te gustó ninguna reseña." />
        ) : (
          <ul className="max-w-2xl divide-y divide-border border-y border-border">
            {reviews.map((review) => (
              <li key={review.entryId} className="flex gap-3 py-3" data-testid="liked-review">
                <div className="w-14 shrink-0">
                  <GamePoster
                    href={reviewFocusHref(review.gameId, review.entryId)}
                    name={review.gameName}
                    imageUrl={review.imageUrl}
                    sizes="56px"
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Link
                    href={reviewFocusHref(review.gameId, review.entryId)}
                    className="type-headline text-ink hover:underline"
                  >
                    {review.gameName}
                  </Link>
                  <StarRatingDisplay rating={review.rating} tone="others" />
                  {review.review && (
                    <p className="line-clamp-3 type-review text-ink-muted">{review.review}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="liked-lists-heading">
        <SectionHeader title={<span id="liked-lists-heading">Listas</span>} />
        {lists.length === 0 ? (
          <EmptyState icon="list" title="Todavía no te gustó ninguna lista." />
        ) : (
          <ul className="max-w-2xl divide-y divide-border border-y border-border">
            {lists.map((list) => (
              <li key={list.listId} data-testid="liked-list">
                <Link
                  href={`/listas/${list.listId}`}
                  className="flex min-h-11 items-center gap-3 px-1 py-2.5 type-body text-ink transition-colors hover:bg-surface-hover"
                >
                  <Icon name="list" className="h-4 w-4 text-ink-faint" />
                  <span className="flex-1">{list.title}</span>
                  <Icon name="chevron-right" className="h-4 w-4 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ProfileSubpage>
  );
}
