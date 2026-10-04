import { PostDetailScreen } from "@/components/posts/PostDetailScreen";
import { RouteModal } from "@/components/posts/RouteModal";

/** `/publicaciones/[id]` interceptada: el detalle en un modal sobre el feed o la grilla. */
export default async function PostModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RouteModal title="Publicación">
      <PostDetailScreen postId={id} inModal />
    </RouteModal>
  );
}
