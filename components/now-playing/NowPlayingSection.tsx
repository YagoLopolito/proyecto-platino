import type { ReactNode } from "react";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterRow, PosterRowItem } from "@/components/game/PosterGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import type { NowPlayingGame } from "@/lib/now-playing/queries";
import { StopPlayingButton } from "./StopPlayingButton";

/**
 * "Jugando ahora" (epic #183, issue #187): una fila de pósters. La usan el
 * perfil propio, el ajeno y la biblioteca.
 *
 * Es un `PosterRow` y no una grilla: lo que estás jugando son pocos juegos y
 * el orden (lo último que empezaste primero) importa más que verlos todos.
 *
 * Sin `emptyMessage` la sección no se muestra si está vacía: en la biblioteca
 * una fila vacía arriba de todo sería ruido; en el perfil propio, en cambio,
 * el vacío explica que la función existe.
 */
export function NowPlayingSection({
  games,
  canStop = false,
  emptyMessage,
  emptyAction,
}: {
  games: NowPlayingGame[];
  /** Muestra "Dejé de jugarlo" debajo de cada carátula (sólo lo propio). */
  canStop?: boolean;
  emptyMessage?: string;
  emptyAction?: ReactNode;
}) {
  if (games.length === 0 && !emptyMessage) return null;

  return (
    <section className="space-y-3" aria-labelledby="now-playing-heading">
      <SectionHeader title={<span id="now-playing-heading">Jugando ahora</span>} />
      {games.length === 0 ? (
        <EmptyState icon="gamepad" title={emptyMessage!} action={emptyAction} />
      ) : (
        <PosterRow>
          {games.map((game) => (
            <PosterRowItem key={game.id}>
              <GamePoster
                href={`/juegos/${game.id}`}
                name={game.name}
                imageUrl={game.imageUrl}
                sizes="132px"
              />
              {canStop && <StopPlayingButton gameId={game.id} gameName={game.name} />}
            </PosterRowItem>
          ))}
        </PosterRow>
      )}
    </section>
  );
}
