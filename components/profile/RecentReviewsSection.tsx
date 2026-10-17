import Link from "next/link";
import { GamePoster } from "@/components/game/GamePoster";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/ui/Icon";
import type { RatingTone } from "@/components/diary/StarRating";
import type { DiaryTimelineEntry } from "@/lib/diary/queries";
import { reviewFocusHref } from "@/lib/game-page/review-focus";

/** Cuántas entradas muestra "Últimas reseñas" en el perfil propio. */
export const RECENT_REVIEWS_LIMIT = 5;

/**
 * "Últimas reseñas" del perfil propio (issue #196): las 5 últimas entradas del
 * diario como una fila de pósters con sus estrellas y el ícono `note` si
 * tienen texto -- el "Recent activity" de Letterboxd. El texto de las reseñas
 * vive en `/perfil/resenas`, a un toque.
 */
export function RecentReviewsSection({
  entries,
  tone = "own",
  emptyMessage = "Todavía no marcaste ninguna partida como terminada.",
  more = { href: "/perfil/resenas", label: "Ver todas tus reseñas" },
}: {
  entries: DiaryTimelineEntry[];
  /** `others` en el perfil ajeno (#197): las estrellas de otro no van en el color de acción. */
  tone?: RatingTone;
  emptyMessage?: string;
  more?: { href: string; label: string };
}) {
  return (
    <section className="space-y-3" aria-labelledby="recent-reviews-heading">
      <SectionHeader title={<span id="recent-reviews-heading">Últimas reseñas</span>} />
      {entries.length === 0 ? (
        <EmptyState icon="book" title={emptyMessage} />
      ) : (
        <>
          <ul className="grid grid-cols-5 gap-x-1.5 gap-y-3 sm:gap-x-2.5">
            {entries.slice(0, RECENT_REVIEWS_LIMIT).map((entry) => (
              <li key={entry.id} data-testid="profile-diary-entry">
                <GamePoster
                  href={reviewFocusHref(entry.gameId, entry.id)}
                  name={entry.gameName}
                  imageUrl={entry.imageUrl}
                  isPlatinum={entry.isPlatinum}
                  isCompleted={entry.isCompleted}
                  sizes="(max-width: 520px) 19vw, 160px"
                  caption={
                    <span className="flex items-center justify-between gap-1">
                      <StarRatingDisplay rating={entry.rating} tone={tone} />
                      {entry.review && (
                        <Icon
                          name="note"
                          label="Tiene reseña"
                          className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                        />
                      )}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
          <Link
            href={more.href}
            className="inline-flex min-h-11 items-center gap-1 type-meta font-medium text-accent-ink hover:underline"
          >
            {more.label}
            <Icon name="chevron-right" className="h-4 w-4" />
          </Link>
        </>
      )}
    </section>
  );
}
