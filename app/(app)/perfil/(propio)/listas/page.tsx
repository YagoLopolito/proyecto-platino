import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserLists } from "@/lib/lists/queries";
import { ListCard } from "@/components/lists/ListCard";
import { NewListButton } from "@/components/lists/NewListButton";
import { EmptyState } from "@/components/EmptyState";
import { getListLikes, likeStateOf } from "@/lib/likes/queries";

export const metadata = { title: "Mis listas" };

/**
 * Perfil › Listas (epic #183, issue #189): tus listas, públicas y privadas, la
 * última editada primero.
 */
export default async function PerfilListasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const lists = await getUserLists(supabase, user.id);
  const likes = await getListLikes(
    supabase,
    user.id,
    lists.map((list) => list.id),
  );

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="type-title text-ink">Mis listas</h1>
            <p className="type-meta text-ink-muted">
              {lists.length === 1 ? "1 lista" : `${lists.length} listas`}
            </p>
          </div>
          <NewListButton />
        </div>

        {lists.length === 0 ? (
          <EmptyState
            icon="list"
            title="Todavía no armaste ninguna lista."
            description="Tus favoritos de una saga, los platinos más difíciles, lo que recomendarías a alguien que arranca: numeradas o no, públicas o privadas."
          />
        ) : (
          <ul
            aria-label="Tus listas"
            className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4"
          >
            {lists.map((list) => (
              <li key={list.id}>
                <ListCard list={list} likeCount={likeStateOf(likes, list.id).count} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
