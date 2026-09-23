import { StarRatingDisplay } from "@/components/diary/StarRating";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { profileLabel } from "@/lib/friends/constants";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/ui/Icon";
import type { FriendDiaryEntry, FriendProfile } from "@/lib/friends/queries";

/** Cuántas partidas de amigos se muestran en el feed corto de /diario. */
export const FRIENDS_FEED_PREVIEW_LIMIT = 10;

const SHORT_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** `finished_on` es `date` ("YYYY-MM-DD"): se corta el string, no `new Date`. */
function shortDate(finishedOn: string): string {
  const [, month, day] = finishedOn.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1] ?? month}`;
}

/**
 * Feed corto "Jugados por amigos" como grilla de carátulas (estilo Letterbox):
 * las últimas partidas terminadas por la gente que agregaste, sin ocupar media
 * pantalla. Cada carátula entra al diario de ese juego, donde está la reseña
 * completa; el listado entero vive en `/diario/amigos`.
 */
export function FriendsDiaryGrid({
  friends,
  entries,
  limit = FRIENDS_FEED_PREVIEW_LIMIT,
}: {
  friends: FriendProfile[];
  entries: FriendDiaryEntry[];
  limit?: number;
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
    <PosterGrid>
      {entries.slice(0, limit).map((entry) => {
        const author = profileLabel(entry.author);
        return (
          <li key={entry.id} data-testid="friend-entry">
            <GamePoster
              href={`/juegos/${entry.gameId}`}
              name={entry.gameName}
              imageUrl={entry.imageUrl}
              // El badge de platino no se puede derivar acá: sale de
              // `user_trophies`, que es privado (ver CLAUDE.md).
              overlay={
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-background/85 px-1.5 py-1">
                  <FriendAvatar url={entry.author.avatarUrl} name={author} size={14} />
                  <span className="truncate text-[10px] text-ink-muted">{author}</span>
                </div>
              }
              caption={
                <span className="flex flex-wrap items-center justify-between gap-x-1.5">
                  <StarRatingDisplay rating={entry.rating} tone="others" />
                  <span className="flex items-center gap-1 text-ink-faint">
                    {entry.review && <Icon name="note" className="h-3 w-3" label="Tiene reseña" />}
                    {shortDate(entry.finishedOn)}
                  </span>
                </span>
              }
            />
          </li>
        );
      })}
    </PosterGrid>
  );
}
