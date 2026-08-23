import Image from "next/image";
import Link from "next/link";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
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
      <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
        Todavía no agregaste amigos. Agregá a alguien para ver qué está jugando.
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
        Tus amigos todavía no marcaron ningún juego como terminado.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => {
        const author = profileLabel(entry.author);
        return (
          <li key={entry.id}>
            <Link
              href={`/juegos/${entry.gameId}/diario`}
              className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-600"
            >
              {entry.imageUrl ? (
                <Image
                  src={entry.imageUrl}
                  alt={entry.gameName}
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-500">
                  Sin img
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-zinc-100">
                  <span className="min-w-0 break-words">{entry.gameName}</span>
                  {entry.playthroughNumber > 1 && (
                    <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      Rejugada #{entry.playthroughNumber}
                    </span>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5 text-zinc-400">
                    <FriendAvatar url={entry.author.avatarUrl} name={author} size={20} />
                    {author}
                  </span>
                  <span>{formatDate(entry.finishedOn)}</span>
                  {entry.platform && <span>{entry.platform}</span>}
                  <StarRatingDisplay rating={entry.rating} />
                </p>
                {entry.review && (
                  <p className="line-clamp-3 whitespace-pre-line break-words text-xs leading-relaxed text-zinc-400">
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
