import { GameArt } from "@/components/game/GameArt";
import Link from "next/link";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { profileLabel } from "@/lib/friends/constants";
import type { FriendDiaryEntry, FriendProfile } from "@/lib/friends/queries";

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * `finished_on` es una columna `date` ("YYYY-MM-DD"): se formatea a mano y no
 * con `new Date(...)`, que la interpretaría como UTC y podría correr el día
 * (misma razón que en DiaryTimeline).
 */
function formatDate(finishedOn: string): string {
  const [year, month, day] = finishedOn.split("-");
  return `${Number(day)} de ${MONTH_NAMES[Number(month) - 1] ?? month} ${year}`;
}

/**
 * "Jugados por amigos": las entradas de diario de la gente que agregaste, más
 * reciente primero. Sin filtros ni agrupado por mes a propósito -- es un feed
 * de novedades, no el archivo cronológico que es el diario propio.
 *
 * Son filas con hairline y no tarjetas (misma regla que la lista de trofeos y
 * el diario propio, fases 3 y 4 del issue #176): lo que interesa distinguir es
 * la reseña de cada uno, no el marco. La carátula va en 3:4 como en el resto
 * de la app, no en un cuadrado que la recortaba.
 */
export function FriendsDiaryFeed({
  friends,
  entries,
}: {
  friends: FriendProfile[];
  entries: FriendDiaryEntry[];
}) {
  if (friends.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="Todavía no agregaste amigos."
        description="Agregá a alguien para ver qué está jugando."
      />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState icon="book" title="Tus amigos todavía no marcaron ningún juego como terminado." />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {entries.map((entry) => {
        const author = profileLabel(entry.author);
        return (
          <li key={entry.id}>
            <Link
              href={`/juegos/${entry.gameId}/diario`}
              className="group flex items-start gap-3 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
            >
              <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-chip border border-border bg-surface">
                {entry.imageUrl ? (
                  <GameArt
                    src={entry.imageUrl}
                    alt={entry.gameName}
                    sizes="48px"
                    className="object-cover"
                    fallback={<FeedCoverPlaceholder />}
                  />
                ) : (
                  <FeedCoverPlaceholder />
                )}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-subtitle text-ink group-hover:text-accent-ink">
                  <span className="min-w-0 break-words">{entry.gameName}</span>
                  {entry.playthroughNumber > 1 && (
                    <span className="rounded-chip border border-border-strong px-1.5 py-0.5 type-caption font-normal text-ink-muted">
                      Rejugada #{entry.playthroughNumber}
                    </span>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-ink-faint">
                  <span className="flex items-center gap-1.5 text-ink-muted">
                    <FriendAvatar url={entry.author.avatarUrl} name={author} size={20} />
                    {author}
                  </span>
                  <span>{formatDate(entry.finishedOn)}</span>
                  {entry.platform && <span>{entry.platform}</span>}
                  <StarRatingDisplay rating={entry.rating} />
                </p>
                {entry.review && (
                  <p className="line-clamp-3 whitespace-pre-line break-words type-review text-ink-muted">
                    {entry.review}
                  </p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function FeedCoverPlaceholder() {
  return (
    <span className="flex h-full w-full items-center justify-center text-border-strong">
      <Icon name="gamepad" className="h-5 w-5" />
    </span>
  );
}
