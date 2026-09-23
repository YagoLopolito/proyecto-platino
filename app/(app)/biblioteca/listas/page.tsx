import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFriendsLists, getPopularListsThisWeek, type ListRowData } from "@/lib/lists/queries";
import { getSystemListRows } from "@/lib/lists/system";
import { NewListButton } from "@/components/lists/NewListButton";
import { ListRow } from "@/components/lists/ListRow";
import AddFriendModal from "@/components/friends/AddFriendModal";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";

export const metadata = { title: "Listas" };

/** Con menos listas que esto, "Populares esta semana" no es un ranking: no aparece. */
const MIN_POPULAR_LISTS = 3;

function ListSection({
  title,
  description,
  lists,
  empty,
}: {
  title: string;
  description?: string;
  lists: ListRowData[];
  empty?: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <SectionHeader title={title} description={description} />
      {lists.length === 0 ? (
        empty
      ) : (
        <ul className="divide-y divide-border">
          {lists.map((list) => (
            <li key={list.href}>
              <ListRow list={list} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Biblioteca › Listas (epic #183, issue #192), la tab Lists de Letterboxd:
 * primero lo de tus amigos, después lo que arma Platinoob con datos y, si hay
 * movimiento, las listas que más gustaron en la semana.
 */
export default async function BibliotecaListasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [friends, systemLists, popular] = await Promise.all([
    getFriendsLists(supabase, user.id),
    getSystemListRows(supabase, user.id),
    getPopularListsThisWeek(supabase, user.id),
  ]);

  return (
    // max-w-5xl: es un listado, mismo ancho que la biblioteca.
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="type-title text-ink">Listas</h1>
            <p className="type-body text-ink-muted">
              Las de tus amigos y las que arma Platinoob con lo que se juega acá.
            </p>
          </div>
          <NewListButton />
        </div>

        <ListSection
          title="Nuevas de tus amigos"
          lists={friends.lists}
          empty={
            friends.hasFriends ? (
              <EmptyState icon="list" title="Tus amigos todavía no publicaron ninguna lista." />
            ) : (
              <EmptyState
                icon="users"
                title="Todavía no seguís a nadie."
                description="Seguí a tus amigos para ver las listas que arman."
                action={<AddFriendModal label="Buscar amigos" />}
              />
            )
          }
        />

        <ListSection
          title="Armadas por Platinoob"
          description="Se calculan solas con las puntuaciones, los platinos y los tiempos de juego."
          lists={systemLists}
          empty={
            <EmptyState
              icon="chart"
              title="Todavía no hay datos suficientes para armar listas."
              description="Aparecen cuando haya juegos puntuados, jugados o con tiempos estimados."
            />
          }
        />

        {popular.length >= MIN_POPULAR_LISTS && (
          <ListSection title="Populares esta semana" lists={popular} />
        )}
      </div>
    </div>
  );
}
