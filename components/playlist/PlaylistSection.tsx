import { GamePoster } from "@/components/game/GamePoster";
import { PosterRow, PosterRowItem } from "@/components/game/PosterGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { PlaylistGame } from "@/lib/playlist/queries";

/** Cuántas carátulas entran en la fila del perfil ajeno. */
export const PROFILE_PLAYLIST_PREVIEW_LIMIT = 12;

/**
 * La Playlist en el perfil de otro usuario (epic #183, issue #188): una fila de
 * pósters con el total en la cabecera. Es pública, como la watchlist de
 * Letterboxd. Vacía no se muestra: en un perfil ajeno, "no tiene Playlist" no
 * le dice nada a quien mira.
 */
export function PlaylistSection({ games, total }: { games: PlaylistGame[]; total: number }) {
  if (games.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="playlist-heading">
      <SectionHeader
        title={
          <span id="playlist-heading">
            Playlist <span className="text-ink-faint">· {total}</span>
          </span>
        }
      />
      <PosterRow>
        {games.map((game) => (
          <PosterRowItem key={game.id}>
            <GamePoster
              href={`/juegos/${game.id}`}
              name={game.name}
              imageUrl={game.imageUrl}
              sizes="132px"
            />
          </PosterRowItem>
        ))}
      </PosterRow>
    </section>
  );
}
