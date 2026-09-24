import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlaylist } from "@/lib/playlist/queries";
import { parsePlaylistSort, sortPlaylist } from "@/lib/playlist/sort";
import { EmptyState } from "@/components/EmptyState";
import { buttonClassName } from "@/components/Button";
import { PlaylistView } from "@/components/playlist/PlaylistView";

export const metadata = { title: "Playlist" };

/** Perfil › Playlist propia (epic #183, issue #188). */
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
    <PlaylistView
      title="Playlist"
      subtitle={`${games.length === 1 ? "1 juego" : `${games.length} juegos`} que querés jugar`}
      gridLabel="Juegos de tu Playlist"
      games={games}
      sort={sort}
      empty={
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
      }
    />
  );
}
