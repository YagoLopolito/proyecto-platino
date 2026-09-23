import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import type { ListSummary } from "@/lib/lists/queries";
import { LikeCount } from "@/components/likes/LikeButton";

/**
 * Tarjeta de una lista: las primeras carátulas superpuestas (como las listas
 * de Letterboxd), el título y cuántos juegos tiene. Toda la tarjeta es el
 * link a la ficha de la lista.
 */
export function ListCard({
  list,
  likeCount = 0,
}: {
  list: ListSummary;
  /** Me gusta de la lista (#190). Sólo el contador: la tarjeta entera es un link. */
  likeCount?: number;
}) {
  const covers = [...list.covers, null, null, null, null].slice(0, 4);

  return (
    <Link
      href={`/listas/${list.id}`}
      className="group block space-y-2 rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      <span className="flex" aria-hidden="true">
        {covers.map((url, index) => (
          <span
            key={index}
            style={{ zIndex: 4 - index }}
            className={`relative block aspect-[3/4] w-1/4 overflow-hidden rounded-chip border border-border bg-surface shadow-md transition-colors group-hover:border-border-strong ${
              index > 0 ? "-ml-3" : ""
            }`}
          >
            {url && (
              <GameArt src={url} alt="" sizes="96px" className="object-cover" fallback={null} />
            )}
          </span>
        ))}
      </span>
      <span className="block">
        <span className="block truncate type-subtitle text-ink group-hover:text-accent-ink">
          {list.title}
        </span>
        <span className="flex items-center gap-1.5 type-caption text-ink-faint">
          {list.itemCount === 1 ? "1 juego" : `${list.itemCount} juegos`}
          {list.visibility === "private" && (
            <>
              <span aria-hidden="true">·</span>
              Privada
            </>
          )}
          <LikeCount count={likeCount} />
        </span>
      </span>
    </Link>
  );
}
