import type { ReactNode } from "react";
import { GamePoster } from "@/components/game/GamePoster";
import { PlaylistSortSelect } from "@/components/playlist/PlaylistSortSelect";
import type { PlaylistGame } from "@/lib/playlist/queries";
import type { PlaylistSort } from "@/lib/playlist/sort";

/**
 * Perfil › Playlist (epic #183, issues #188 y #197), propia y ajena: los juegos
 * que alguien quiere jugar, como la Watchlist de Letterboxd.
 *
 * Grilla de 4 columnas en mobile y 6 en escritorio, más densa que la de la
 * biblioteca (3): acá la carátula es un recordatorio, no algo a lo que volver a
 * mirar el progreso. Por eso tampoco lleva barra de progreso ni badges.
 */
export function PlaylistView({
  title,
  subtitle,
  gridLabel,
  games,
  sort,
  empty,
}: {
  title: string;
  subtitle: string;
  gridLabel: string;
  games: PlaylistGame[];
  sort: PlaylistSort;
  empty: ReactNode;
}) {
  return (
    // max-w-5xl: es un listado, mismo ancho que la biblioteca y el diario.
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="type-title text-ink">{title}</h1>
            <p className="type-meta text-ink-muted">{subtitle}</p>
          </div>
          {games.length > 1 && <PlaylistSortSelect value={sort} />}
        </div>

        {games.length === 0 ? (
          empty
        ) : (
          <ul
            aria-label={gridLabel}
            className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6 sm:gap-x-2.5"
          >
            {games.map((game) => (
              <li key={game.id}>
                <GamePoster
                  href={`/juegos/${game.id}`}
                  name={game.name}
                  imageUrl={game.imageUrl}
                  sizes="(max-width: 640px) 23vw, 160px"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
