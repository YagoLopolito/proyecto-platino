import { PostDetailScreen } from "@/components/posts/PostDetailScreen";

export const metadata = { title: "Publicación" };

/**
 * Una publicación de la Galería online como página: lo que se ve al abrir un
 * link compartido, al recargar y en mobile. Navegando dentro de la app, la
 * misma URL abre un modal (`@modal/(.)publicaciones/[id]`).
 */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 sm:px-4 sm:py-8">
      <div className="overflow-hidden bg-surface-raised sm:rounded-card sm:border sm:border-border md:h-[min(85vh,56rem)]">
        <PostDetailScreen postId={id} inModal={false} />
      </div>
    </div>
  );
}
