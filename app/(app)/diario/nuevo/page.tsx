import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CatalogSearchCombobox from "@/components/diary/CatalogSearchCombobox";

export default async function NewDiaryEntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Marcar como terminado</h1>
          <p className="text-sm text-zinc-400">
            Buscá el juego que terminaste. Si no está en tu biblioteca, lo agregamos desde el
            catálogo externo (RAWG).
          </p>
        </div>

        <CatalogSearchCombobox />
      </div>
    </div>
  );
}
