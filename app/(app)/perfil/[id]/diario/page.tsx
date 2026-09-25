import { getUserDiaryEntries } from "@/lib/diary/queries";
import { getOtherProfileContext } from "@/lib/profile/other";
import DiaryTimeline from "@/components/diary/DiaryTimeline";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

/**
 * Perfil › Diario de otro usuario (#197): el mismo timeline que el propio, con
 * sus estrellas en `rating-muted`. El diario es público; el badge de platino
 * no aparece porque sale de `user_trophies`, que es privado.
 */
export default async function PerfilAjenoDiarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, name } = await getOtherProfileContext(id);
  const outcome = await getUserDiaryEntries(supabase, id);

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <h1 className="type-title text-ink">Diario de {name}</h1>
        {outcome.status === "error" ? (
          <ErrorState message={`No se pudo cargar el diario: ${outcome.message}`} />
        ) : (
          <DiaryTimeline
            entries={outcome.entries}
            ratingTone="others"
            empty={
              <EmptyState
                icon="book"
                title={`${name} todavía no marcó ninguna partida como terminada.`}
              />
            }
          />
        )}
      </div>
    </div>
  );
}
