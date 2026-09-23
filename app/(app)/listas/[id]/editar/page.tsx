import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getList } from "@/lib/lists/queries";
import { ListEditor } from "@/components/lists/ListEditor";
import { DeleteListButton } from "@/components/lists/DeleteListButton";

export const metadata = { title: "Editar lista" };

/**
 * Editar una lista propia (epic #183, issue #189). La de otro usuario da 404
 * acá también, aunque sea pública: no hay nada que editar desde afuera. La
 * Server Action y la RLS vuelven a chequearlo al guardar.
 */
export default async function EditListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const list = await getList(supabase, id);
  if (!list || list.ownerId !== user.id) notFound();

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="type-title text-ink">Editar lista</h1>
        <ListEditor
          initial={{
            id: list.id,
            title: list.title,
            description: list.description ?? "",
            isRanked: list.isRanked,
            visibility: list.visibility,
            items: list.items.map((item) => ({
              gameId: item.gameId,
              name: item.name,
              imageUrl: item.imageUrl,
              note: item.note ?? "",
            })),
          }}
        />
        <div className="border-t border-border pt-6">
          <DeleteListButton listId={list.id} title={list.title} />
        </div>
      </div>
    </div>
  );
}
