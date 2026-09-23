import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ListEditor, type EditorItem } from "@/components/lists/ListEditor";

export const metadata = { title: "Nueva lista" };

/**
 * Crear una lista (epic #183, issue #189). `?juego=<id>` arranca la lista con
 * ese juego adentro: es el "Nueva lista con este juego" de la ficha.
 */
export default async function NewListPage({
  searchParams,
}: {
  searchParams: Promise<{ juego?: string }>;
}) {
  const { juego } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const items: EditorItem[] = [];
  const gameId = z.string().uuid().safeParse(juego);
  if (gameId.success) {
    const { data: game } = await supabase
      .from("games")
      .select("id, name, cover_url, icon_url")
      .eq("id", gameId.data)
      .maybeSingle();
    if (game) {
      items.push({
        gameId: game.id,
        name: game.name,
        imageUrl: game.cover_url ?? game.icon_url,
        note: "",
      });
    }
  }

  return (
    // max-w-2xl: es un formulario (ver la sección de anchos en CLAUDE.md).
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="type-title text-ink">Nueva lista</h1>
        <ListEditor
          initial={{ title: "", description: "", isRanked: false, visibility: "public", items }}
        />
      </div>
    </div>
  );
}
