import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getUserPostsPage } from "@/lib/posts/queries";
import { pageHref, parsePageParam } from "@/lib/posts/pagination";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { NewPostLink } from "./NewPostLink";
import { Pagination } from "./Pagination";
import { PostGrid } from "./PostGrid";

/**
 * Perfil › Galería: las publicaciones de un usuario en la grilla de 3
 * columnas, paginada. La misma para el perfil propio y el ajeno; sólo cambian
 * los textos y el "Nueva publicación".
 */
export async function ProfilePostsGrid({
  supabase,
  viewerId,
  userId,
  basePath,
  rawPage,
  isOwn,
  name,
}: {
  supabase: SupabaseClient<Database>;
  viewerId: string;
  userId: string;
  basePath: string;
  rawPage: string | undefined;
  isOwn: boolean;
  name: string;
}) {
  const page = parsePageParam(rawPage);
  const outcome = await getUserPostsPage(supabase, viewerId, userId, page);
  if (outcome.status === "ok" && page > outcome.pageCount) {
    redirect(pageHref(basePath, outcome.pageCount));
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 py-6 sm:px-4">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-0">
        <h1 className="type-title">{isOwn ? "Tu galería" : `Galería de ${name}`}</h1>
        {isOwn && <NewPostLink label="Publicar" />}
      </div>
      {outcome.status === "error" ? (
        <div className="px-4 sm:px-0">
          <ErrorState message={`No se pudo cargar la galería: ${outcome.message}`} />
        </div>
      ) : outcome.posts.length === 0 ? (
        <div className="px-4 sm:px-0">
          <EmptyState
            icon="image"
            title={isOwn ? "Todavía no publicaste nada." : `${name} todavía no publicó nada.`}
            description={isOwn ? "Subí capturas y clips de tus juegos." : undefined}
            action={isOwn ? <NewPostLink label="Publicar la primera" /> : undefined}
          />
        </div>
      ) : (
        <>
          <PostGrid posts={outcome.posts} showGame />
          <Pagination
            basePath={basePath}
            page={outcome.page}
            pageCount={outcome.pageCount}
            label="Páginas de la galería"
          />
        </>
      )}
    </div>
  );
}
