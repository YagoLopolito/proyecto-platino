import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CatalogSearchCombobox from "@/components/diary/CatalogSearchCombobox";
import DiaryTimeline from "@/components/diary/DiaryTimeline";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import { ErrorState } from "@/components/ErrorState";

/** Cuántas entradas ya guardadas se muestran debajo del buscador. */
const RECENT_LIMIT = 10;

export default async function NewDiaryEntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const outcome = await getUserDiaryEntries(supabase, user.id, RECENT_LIMIT);

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-8 sm:py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Marcar como terminado</h1>
          <p className="text-sm text-zinc-400">
            Buscá el juego que terminaste. Si no está en tu biblioteca, lo agregamos desde el
            catálogo externo (RAWG).
          </p>
        </div>

        <CatalogSearchCombobox />

        <section className="space-y-4 border-t border-zinc-800 pt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-300">Ya marcados</h2>
            <Link href="/diario" className="text-xs text-blue-400 hover:underline">
              Ver diario completo
            </Link>
          </div>

          {outcome.status === "error" ? (
            <ErrorState message={`No se pudieron cargar tus entradas: ${outcome.message}`} />
          ) : (
            <DiaryTimeline entries={outcome.entries} />
          )}
        </section>
      </div>
    </div>
  );
}
