import { SectionPlaceholder } from "@/components/SectionPlaceholder";

export const metadata = { title: "Playlist" };

/** Perfil › Playlist (el backlog). Llega con el sub-issue #188. */
export default function PerfilPlaylistPage() {
  return (
    <SectionPlaceholder
      icon="clock"
      title="Los juegos que querés jugar, para no olvidarte de ninguno."
      description="Próximamente."
    />
  );
}
