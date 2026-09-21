import type { ReactNode } from "react";
import { GamePoster } from "@/components/game/GamePoster";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { MAX_FAVORITE_GAMES } from "@/lib/profile/constants";
import type { FavoriteGame } from "@/lib/profile/queries";

/**
 * El "Top 5" del perfil: los juegos que el usuario eligió mostrar, en su
 * orden, con el número de puesto sobre la carátula.
 *
 * Va en grilla fija de 5 columnas (no en `PosterRow`) porque son exactamente
 * cinco y el puesto importa: se tienen que ver todos juntos, sin scrollear.
 */
export function FavoriteGamesSection({
  games,
  action,
  emptyMessage,
}: {
  games: FavoriteGame[];
  /** Botón de editar, solo en el perfil propio. */
  action?: ReactNode;
  emptyMessage: string;
}) {
  return (
    <section className="space-y-3" aria-labelledby="top-five-heading">
      <SectionHeader
        title={<span id="top-five-heading">Top {MAX_FAVORITE_GAMES}</span>}
        action={action}
      />
      {games.length === 0 ? (
        <EmptyState icon="star" title={emptyMessage} />
      ) : (
        /*
         * Cinco columnas desde el primer breakpoint (antes eran 3 en mobile):
         * el Top 5 tiene que leerse como una sola fila, igual que la fila de
         * favoritos de Letterboxd. Con 3 columnas quedaba una fila de 3 y otra
         * de 2, que se lee como "hay más abajo" cuando no lo hay.
         */
        <ul className="grid grid-cols-5 gap-x-1.5 gap-y-3 sm:gap-x-2.5">
          {games.map((game, index) => (
            <li key={game.id} data-testid="favorite-game">
              <GamePoster
                href={`/juegos/${game.id}`}
                name={game.name}
                imageUrl={game.imageUrl}
                sizes="(max-width: 520px) 19vw, 160px"
                overlay={
                  <span className="absolute left-1 top-1 rounded-chip bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ink backdrop-blur-sm">
                    #{index + 1}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
