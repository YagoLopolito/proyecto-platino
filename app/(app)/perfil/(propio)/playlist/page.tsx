import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlaylist } from "@/lib/playlist/queries";
import { parsePlaylistSort, sortPlaylist } from "@/lib/playlist/sort";
import { GamePoster } from "@/components/game/GamePoster";
import { EmptyState } from "@/components/EmptyState";
import { buttonClassName } from "@/components/Button";
import { PlaylistSortSelect } from "@/components/playlist/PlaylistSortSelect";

export const metadata = { title: "Playlist" };

/**
 * Perfil › Playlist (epic #183, issue #188): los juegos que querés jugar, como
 * la Watchlist de Letterboxd.
 *
 * Grilla de 4 columnas en mobile y 6 en escritorio, más densa que la de la
 * biblioteca (3): acá la carátula es un recordatorio, no algo a lo que volver a
 * mirar el progreso. Por eso tampoco lleva barra de progreso ni badges.
 */
export default async function PerfilPlaylistPage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string }>;
}) {
  const sort = parsePlaylistSort((await searchParams).orden);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const games = sortPlaylist(await getPlaylist(supabase, user.id), sort);

  return (
    // max-w-5xl: es un listado, mismo ancho que la biblioteca y el diario.
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="type-title text-ink">Playlist</h1>
            <p className="type-meta text-ink-muted">
              {games.length === 1 ? "1 juego" : `${games.length} juegos`} que querés jugar
            </p>
          </div>
          {games.length > 1 && <PlaylistSortSelect value={sort} />}
        </div>

        {games.length === 0 ? (
          <EmptyState
            icon="playlist-add"
            title="Tu Playlist está vacía"
            description="Agregá los juegos que querés jugar desde su ficha, con el botón Playlist. Cuando empieces uno o lo termines, sale solo."
            action={
              <Link href="/buscar" className={buttonClassName("primary")}>
                Buscar juegos
              </Link>
            }
          />
        ) : (
          <ul
            aria-label="Juegos de tu Playlist"
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
