import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";
import type { PostView } from "@/lib/posts/types";

/**
 * Grilla de 3 columnas tipo perfil de Instagram (capturas de un juego, las de
 * un perfil). Cada celda es la portada del post, cuadrada y recortada; el
 * original con su proporción se ve en el detalle. Sin reproducir videos: el
 * poster + el ícono alcanzan, y 45 videos en autoplay serían un horno.
 *
 * El link abre el detalle en un modal sobre la grilla (ruta interceptada) y la
 * misma URL sirve para compartirlo.
 */
export function PostGrid({ posts, showGame = false }: { posts: PostView[]; showGame?: boolean }) {
  return (
    <ul className="grid grid-cols-3 gap-0.5 sm:gap-1 lg:gap-2" data-testid="post-grid">
      {posts.map((post) => {
        const cover = post.media[0];
        const isVideo = cover?.kind === "video";
        const label = [
          `Publicación de ${post.author.name}`,
          showGame ? `en ${post.game.name}` : null,
          post.media.length > 1 ? `${post.media.length} archivos` : null,
          isVideo ? "video" : null,
          post.isSpoiler ? "contiene spoilers" : null,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <li key={post.id}>
            <Link
              href={`/publicaciones/${post.id}`}
              aria-label={label}
              data-testid="post-grid-cell"
              data-spoiler={post.isSpoiler || undefined}
              className="group relative block aspect-square overflow-hidden bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink lg:rounded-chip"
            >
              {cover?.src ? (
                <GameArt
                  src={cover.src}
                  alt=""
                  width={cover.width}
                  height={cover.height}
                  className={`h-full w-full object-cover transition-transform duration-300 motion-reduce:transition-none ${
                    post.isSpoiler ? "scale-110 blur-2xl" : "group-hover:scale-[1.03]"
                  }`}
                  fallback={
                    <span className="flex h-full items-center justify-center text-ink-faint">
                      <Icon name="image" className="h-6 w-6" />
                    </span>
                  }
                />
              ) : (
                <span className="flex h-full items-center justify-center text-ink-faint">
                  <Icon name="image" className="h-6 w-6" />
                </span>
              )}

              {post.isSpoiler && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 type-overline text-white">
                  <Icon name="alert" className="h-5 w-5" />
                  Spoiler
                </span>
              )}

              <span className="absolute right-1.5 top-1.5 flex gap-1 text-white drop-shadow">
                {isVideo && <Icon name="play" className="h-4 w-4 sm:h-5 sm:w-5" />}
                {post.media.length > 1 && (
                  <Icon name="carousel" className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </span>

              {/* Hover de escritorio: likes y comentarios, como Instagram. */}
              <span className="absolute inset-0 hidden items-center justify-center gap-4 bg-black/50 type-meta font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none md:flex">
                <span className="flex items-center gap-1">
                  <Icon name="heart" className="h-4 w-4" />
                  {post.likeCount}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="comment" className="h-4 w-4" />
                  {post.commentCount}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
