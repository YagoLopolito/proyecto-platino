import { getPlaylist } from "@/lib/playlist/queries";
import { parsePlaylistSort, sortPlaylist } from "@/lib/playlist/sort";
import { getOtherProfileContext } from "@/lib/profile/other";
import { EmptyState } from "@/components/EmptyState";
import { PlaylistView } from "@/components/playlist/PlaylistView";

/** Perfil › Playlist de otro usuario (#197). Es pública, como la watchlist de Letterboxd. */
export default async function PerfilAjenoPlaylistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ orden?: string }>;
}) {
  const { id } = await params;
  const sort = parsePlaylistSort((await searchParams).orden);
  const { supabase, name } = await getOtherProfileContext(id);
  const games = sortPlaylist(await getPlaylist(supabase, id), sort);

  return (
    <PlaylistView
      title={`Playlist de ${name}`}
      subtitle={`${games.length === 1 ? "1 juego" : `${games.length} juegos`} que quiere jugar`}
      gridLabel={`Juegos de la Playlist de ${name}`}
      games={games}
      sort={sort}
      empty={<EmptyState icon="playlist-add" title={`La Playlist de ${name} está vacía.`} />}
    />
  );
}
