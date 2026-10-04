import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGalleryFeedPage } from "@/lib/posts/queries";
import { pageHref, parsePageParam } from "@/lib/posts/pagination";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PostCard } from "@/components/posts/PostCard";
import { Pagination } from "@/components/posts/Pagination";
import { NewPostLink } from "@/components/posts/NewPostLink";

export const metadata = { title: "Galería online" };

const BASE_PATH = "/actividad/galeria";

/**
 * Actividad › Galería online: tus publicaciones y las de la gente que seguís,
 * la más nueva primero, paginadas por número (`?page=N`).
 *
 * Columna de lectura (`max-w-xl`) también en escritorio: un feed de fotos
 * estirado a 1440px obliga a mover los ojos de punta a punta y las fotos
 * verticales quedan gigantes. En `lg` el espacio de al costado no aporta nada
 * que no esté ya en el header (Registrar, buscador), así que queda libre.
 */
export default async function GalleryFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const page = parsePageParam((await searchParams).page);
  const outcome = await getGalleryFeedPage(supabase, user.id, page);
  if (outcome.status === "ok" && page > outcome.pageCount) {
    redirect(pageHref(BASE_PATH, outcome.pageCount));
  }

  return (
    <div className="flex flex-1 flex-col bg-background py-6 text-ink sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-0">
          <h1 className="type-title">Galería online</h1>
          <NewPostLink />
        </div>

        {outcome.status === "error" ? (
          <div className="px-4 sm:px-0">
            <ErrorState message={`No se pudo cargar la galería: ${outcome.message}`} />
          </div>
        ) : outcome.posts.length === 0 ? (
          <div className="px-4 sm:px-0">
            <EmptyState
              icon="image"
              title="Todavía no hay publicaciones."
              description="Subí capturas y clips de tus juegos. Acá vas a ver los tuyos y los de la gente que seguís."
              action={<NewPostLink label="Publicar la primera" />}
            />
          </div>
        ) : (
          <>
            <div className="space-y-5 px-3 sm:px-0" data-testid="gallery-feed">
              {outcome.posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            <Pagination
              basePath={BASE_PATH}
              page={outcome.page}
              pageCount={outcome.pageCount}
              label="Páginas de la galería"
            />
          </>
        )}
      </div>
    </div>
  );
}
