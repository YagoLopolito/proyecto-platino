import { redirect } from "next/navigation";
import { getGamePageBase } from "@/lib/game-page/data";
import { getGamePostsPage } from "@/lib/posts/queries";
import { pageHref, parsePageParam } from "@/lib/posts/pagination";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { NewPostLink } from "@/components/posts/NewPostLink";
import { Pagination } from "@/components/posts/Pagination";
import { PostGrid } from "@/components/posts/PostGrid";

/**
 * Tab Capturas de la ficha: las publicaciones de TODOS los usuarios para este
 * juego (no sólo amigos), en grilla de 3 columnas, paginada por número.
 */
export default async function GameCapturesTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id: gameId } = await params;
  const page = parsePageParam((await searchParams).page);
  const { supabase, userId } = await getGamePageBase(gameId);
  const basePath = `/juegos/${gameId}/capturas`;

  const outcome = await getGamePostsPage(supabase, userId, gameId, page);
  if (outcome.status === "ok" && page > outcome.pageCount) {
    redirect(pageHref(basePath, outcome.pageCount));
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 py-6 sm:px-4">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-0">
        <p className="type-meta text-ink-muted">
          {outcome.status === "ok" && outcome.total > 0
            ? `${outcome.total} ${outcome.total === 1 ? "publicación" : "publicaciones"}`
            : "Capturas y clips de la comunidad"}
        </p>
        <NewPostLink gameId={gameId} label="Publicar" />
      </div>

      {outcome.status === "error" ? (
        <div className="px-4 sm:px-0">
          <ErrorState message={`No se pudieron cargar las capturas: ${outcome.message}`} />
        </div>
      ) : outcome.posts.length === 0 ? (
        <div className="px-4 sm:px-0">
          <EmptyState
            icon="camera"
            title="Todavía nadie publicó capturas de este juego."
            description="Subí las tuyas: fotos y clips, en calidad original."
            action={<NewPostLink gameId={gameId} label="Publicar la primera" />}
          />
        </div>
      ) : (
        <>
          <PostGrid posts={outcome.posts} />
          <Pagination
            basePath={basePath}
            page={outcome.page}
            pageCount={outcome.pageCount}
            label="Páginas de capturas"
          />
        </>
      )}
    </div>
  );
}
