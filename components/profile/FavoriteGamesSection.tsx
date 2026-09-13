import type { ReactNode } from "react";
import { GamePoster } from "@/components/game/GamePoster";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
        <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-x-2.5 gap-y-4 min-[520px]:grid-cols-5">
          {games.map((game, index) => (
            <li key={game.id} data-testid="favorite-game">
              <GamePoster
                href={`/juegos/${game.id}`}
                name={game.name}
                imageUrl={game.imageUrl}
                showName
                sizes="(max-width: 520px) 31vw, 160px"
                overlay={
                  <span className="absolute left-1 top-1 rounded bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-zinc-200 backdrop-blur-sm">
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
