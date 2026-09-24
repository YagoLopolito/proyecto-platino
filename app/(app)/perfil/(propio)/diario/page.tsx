import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import DiaryTimeline from "@/components/diary/DiaryTimeline";
import MarkAsFinishedModal from "@/components/diary/MarkAsFinishedModal";
import { DiaryActionsMenu } from "@/components/diary/DiaryActionsMenu";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

/**
 * Perfil › Diario (epic #183, issue #197): tus partidas terminadas con el
 * formato del diario de Letterboxd. El feed de amigos que vivía acá está en
 * Biblioteca › Reseñas y en Actividad; las acciones secundarias, en el ⋮.
 */
export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ nuevo?: string }>;
}) {
  // `?nuevo=1` abre el modal directo (links viejos a /diario/nuevo, empty state).
  const { nuevo } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const outcome = await getUserDiaryEntries(supabase, user.id);

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="type-title text-ink">Mi diario</h1>
          <div className="flex items-center gap-1">
            <MarkAsFinishedModal defaultOpen={nuevo === "1"} />
            <DiaryActionsMenu />
          </div>
        </div>

        {outcome.status === "error" ? (
          <ErrorState message={`No se pudo cargar el diario: ${outcome.message}`} />
        ) : (
          <DiaryTimeline
            entries={outcome.entries}
            empty={
              <EmptyState
                icon="book"
                title="Todavía no marcaste ningún juego como terminado."
                action={
                  <Link href="/perfil/diario?nuevo=1" className="text-accent-ink hover:underline">
                    Marcar uno ahora
                  </Link>
                }
              />
            }
          />
        )}
      </div>
    </div>
  );
}
