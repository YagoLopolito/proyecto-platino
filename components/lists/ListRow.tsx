import Image from "next/image";
import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { LikeCount } from "@/components/likes/LikeButton";
import type { ListRowData } from "@/lib/lists/queries";

/** Cuántas carátulas lleva la tira: las 8 pegadas en mobile, solapadas en escritorio. */
const STRIP_COVERS = 8;

/**
 * Fila de lista de Biblioteca › Listas (epic #183, issue #192), como la tab
 * Lists de Letterboxd: título y autor arriba, y la **tira de pósters** a ancho
 * completo. En mobile las carátulas van pegadas y ocupan el ancho; desde `sm`
 * tienen tamaño fijo y se pisan un 30%, que es lo que hace que una lista se
 * lea como "una pila de juegos" y no como otra grilla.
 *
 * Toda la fila es un solo link a la ficha: el autor no linkea a su perfil,
 * porque un link dentro de otro es HTML inválido.
 */
export function ListRow({ list }: { list: ListRowData }) {
  const covers = [...list.covers, ...Array<null>(STRIP_COVERS).fill(null)].slice(0, STRIP_COVERS);

  return (
    <Link
      href={list.href}
      className="group block space-y-3 rounded-card py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 type-subtitle text-ink group-hover:text-accent-ink">
          {list.title}
        </span>
        <span className="flex shrink-0 items-center gap-2 type-caption text-ink-muted">
          {list.author ? (
            <>
              <span className="max-w-32 truncate">{list.author.name}</span>
              <FriendAvatar url={list.author.avatarUrl} name={list.author.name} size={24} />
            </>
          ) : (
            <>
              <span>Platinoob</span>
              <Image
                src="/icon-192.png"
                alt=""
                width={24}
                height={24}
                unoptimized
                className="h-6 w-6 rounded-full"
              />
            </>
          )}
        </span>
      </span>

      <span className="flex" aria-hidden="true">
        {covers.map((url, index) => (
          <span
            key={index}
            style={{ zIndex: STRIP_COVERS - index }}
            className="relative block aspect-[3/4] w-[12.5%] shrink-0 overflow-hidden border border-background bg-surface sm:w-24 sm:rounded-chip sm:border-border sm:shadow-md sm:[&:not(:first-child)]:-ml-7"
          >
            {url && (
              <GameArt src={url} alt="" sizes="96px" className="object-cover" fallback={null} />
            )}
          </span>
        ))}
      </span>

      <span className="flex items-center gap-2 type-caption text-ink-faint">
        {list.itemCount === 1 ? "1 juego" : `${list.itemCount} juegos`}
        {list.likeCount !== null && <LikeCount count={list.likeCount} />}
      </span>

      {list.description && (
        <span className="line-clamp-3 block max-w-3xl type-body text-ink-muted">
          {list.description}
        </span>
      )}
    </Link>
  );
}
