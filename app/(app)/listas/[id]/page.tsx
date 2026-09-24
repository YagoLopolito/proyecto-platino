import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { countPlayed, getList } from "@/lib/lists/queries";
import { EmptyState } from "@/components/EmptyState";
import { buttonClassName } from "@/components/Button";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { ListGames, ListProgress, parseListView } from "@/components/lists/ListGames";
import { LikeButton, LikeCount } from "@/components/likes/LikeButton";
import { getListLikes, likeStateOf } from "@/lib/likes/queries";

export const metadata = { title: "Lista" };

/**
 * Ficha de una lista (epic #183, issue #189), como la de Letterboxd: el título
 * es contenido editorial y va en la serif, la descripción como una reseña, y
 * debajo los juegos, en grilla de pósters o en detalle con la nota de cada
 * uno.
 *
 * "Vos jugaste N de M" es el gancho de la lista ajena ("You've watched 12 of
 * 500"): cuenta lo que quien mira platinó, completó al 100% o registró en su
 * diario.
 */
export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const [{ id }, { vista }] = await Promise.all([params, searchParams]);
  const view = parseListView(vista);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const list = await getList(supabase, id);
  // Privada y ajena, o inexistente: para afuera son lo mismo.
  if (!list) notFound();

  const isOwner = list.ownerId === user.id;
  const total = list.items.length;
  const [played, likes] = await Promise.all([
    countPlayed(
      supabase,
      user.id,
      list.items.map((item) => item.gameId),
    ),
    getListLikes(supabase, user.id, [list.id]),
  ]);
  const like = likeStateOf(likes, list.id);
  const authorHref = isOwner ? "/perfil" : `/perfil/${list.ownerId}`;
  const updated = new Date(list.updatedAt).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    // max-w-5xl: es un listado, mismo ancho que la biblioteca.
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="space-y-4">
          <Link
            href={authorHref}
            className="inline-flex items-center gap-2 type-meta text-ink-muted hover:text-ink"
          >
            <FriendAvatar url={list.author.avatarUrl} name={list.author.name} size={28} />
            <span>Lista de {list.author.name}</span>
          </Link>
          <h1 className="type-display text-ink">{list.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-overline text-ink-faint">
            <span>{total === 1 ? "1 juego" : `${total} juegos`}</span>
            <span aria-hidden="true">·</span>
            <span>Actualizada el {updated}</span>
            {list.isRanked && (
              <>
                <span aria-hidden="true">·</span>
                <span>Numerada</span>
              </>
            )}
            {list.visibility === "private" && (
              <>
                <span aria-hidden="true">·</span>
                <span>Privada</span>
              </>
            )}
          </p>
          {list.description && (
            <p className="max-w-3xl whitespace-pre-line type-review text-ink-muted">
              {list.description}
            </p>
          )}
          {/* No se likea lo propio (#190): sobre tu lista, sólo el contador. */}
          <div className="flex flex-wrap items-center gap-4">
            {isOwner ? (
              <>
                <Link href={`/listas/${list.id}/editar`} className={buttonClassName("secondary")}>
                  Editar lista
                </Link>
                <LikeCount count={like.count} />
              </>
            ) : (
              <LikeButton
                kind="list"
                targetId={list.id}
                liked={like.liked}
                count={like.count}
                label={`Me gusta la lista ${list.title}`}
              />
            )}
          </div>
        </header>

        {total > 0 && <ListProgress played={played} total={total} />}

        {total === 0 ? (
          <EmptyState
            icon="list"
            title="Esta lista todavía no tiene juegos."
            action={
              isOwner ? (
                <Link href={`/listas/${list.id}/editar`} className={buttonClassName("primary")}>
                  Agregar juegos
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ListGames
            items={list.items}
            isRanked={list.isRanked}
            view={view}
            href={`/listas/${list.id}`}
          />
        )}
      </div>
    </div>
  );
}
