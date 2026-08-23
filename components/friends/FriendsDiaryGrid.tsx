import Image from "next/image";
import Link from "next/link";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { profileLabel } from "@/lib/friends/constants";
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
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {entries.slice(0, limit).map((entry) => {
        const author = profileLabel(entry.author);
        return (
          <li key={entry.id}>
            <Link
              href={`/juegos/${entry.gameId}/diario`}
              className="group block"
              title={entry.review ? `${entry.gameName} — ver reseña de ${author}` : entry.gameName}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 transition group-hover:border-zinc-500">
                {entry.imageUrl ? (
                  <Image
                    src={entry.imageUrl}
                    alt={entry.gameName}
                    fill
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 200px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-zinc-500">
                    {entry.gameName}
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-zinc-950/85 px-2 py-1.5">
                  <FriendAvatar url={entry.author.avatarUrl} name={author} size={18} />
                  <span className="truncate text-xs text-zinc-300">{author}</span>
                </div>
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-zinc-500">
                <StarRatingDisplay rating={entry.rating} />
                <span className="flex items-center gap-1">
                  {entry.review && <span title="Tiene reseña">📝</span>}
                  {shortDate(entry.finishedOn)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
