import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { countPlayed, getList } from "@/lib/lists/queries";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { GameArt } from "@/components/game/GameArt";
import { EmptyState } from "@/components/EmptyState";
import { ProgressBar } from "@/components/ProgressBar";
import { buttonClassName } from "@/components/Button";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Lista" };

type View = "grilla" | "detalle";

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
  const view: View = vista === "detalle" ? "detalle" : "grilla";

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
  const played = await countPlayed(
    supabase,
    user.id,
    list.items.map((item) => item.gameId),
  );
  const authorHref = isOwner ? "/perfil" : `/perfil/${list.ownerId}`;
  const updated = new Date(list.updatedAt).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const viewLink = (value: View, label: string) => (
    <Link
      href={value === "grilla" ? `/listas/${list.id}` : `/listas/${list.id}?vista=detalle`}
      aria-current={view === value ? "page" : undefined}
      className={`flex min-h-10 items-center rounded-chip px-3 type-caption font-medium transition-colors sm:min-h-9 ${
        view === value
          ? "bg-accent/15 text-accent-ink shadow-[inset_0_0_0_1px_var(--color-accent-ink)]"
          : "text-ink-muted hover:bg-surface-hover hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );

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
          {isOwner && (
            <Link href={`/listas/${list.id}/editar`} className={buttonClassName("secondary")}>
              Editar lista
            </Link>
          )}
        </header>

        {total > 0 && (
          <section aria-label="Tu progreso en la lista" className="max-w-md space-y-1.5">
            <p className="type-meta text-ink-muted">
              Vos jugaste <span className="font-semibold text-ink">{played}</span> de {total}
            </p>
            <ProgressBar percent={(played / total) * 100} className="h-1" />
          </section>
        )}

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
          <div className="space-y-4">
            <nav
              aria-label="Vista de la lista"
              className="inline-flex items-center rounded-card border border-border-strong bg-surface p-0.5"
            >
              {viewLink("grilla", "Grilla")}
              {viewLink("detalle", "Detalle")}
            </nav>

            {view === "grilla" ? (
              <PosterGrid>
                {list.items.map((item, index) => (
                  <li key={item.gameId}>
                    <GamePoster
                      href={`/juegos/${item.gameId}`}
                      name={item.name}
                      imageUrl={item.imageUrl}
                      overlay={
                        list.isRanked ? (
                          <span className="absolute left-1 top-1 rounded-chip bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ink backdrop-blur-sm">
                            {index + 1}
                          </span>
                        ) : undefined
                      }
                    />
                  </li>
                ))}
              </PosterGrid>
            ) : (
              <ol aria-label="Juegos de la lista" className="divide-y divide-border">
                {list.items.map((item, index) => (
                  <li key={item.gameId}>
                    <Link
                      href={`/juegos/${item.gameId}`}
                      className="flex gap-3 py-3 transition-colors hover:bg-surface-hover/50"
                    >
                      {list.isRanked && (
                        <span className="w-7 shrink-0 pt-0.5 text-right type-stat text-ink-faint">
                          {index + 1}
                        </span>
                      )}
                      <span className="relative block aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-chip border border-border bg-surface">
                        {item.imageUrl ? (
                          <GameArt
                            src={item.imageUrl}
                            alt=""
                            sizes="56px"
                            className="object-cover"
                            fallback={null}
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center text-ink-faint">
                            <Icon name="gamepad" className="h-5 w-5" />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 space-y-1">
                        <span className="block type-subtitle text-ink">
                          {item.name}
                          {item.releaseYear && (
                            <span className="ml-2 type-meta text-ink-faint">
                              {item.releaseYear}
                            </span>
                          )}
                        </span>
                        {item.note && (
                          <span className="block type-review text-ink-muted">{item.note}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
