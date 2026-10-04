import { NewPostScreen } from "@/components/posts/NewPostScreen";
import { RouteModal } from "@/components/posts/RouteModal";

/** `/publicaciones/nueva` interceptada: el compositor sobre la pantalla de la que se vino. */
export default async function NewPostModal({
  searchParams,
}: {
  searchParams: Promise<{ juego?: string }>;
}) {
  const { juego } = await searchParams;
  return (
    <RouteModal title="Nueva publicación" size="form">
      <div className="p-4 sm:p-6">
        <NewPostScreen gameId={juego} inModal />
      </div>
    </RouteModal>
  );
}
