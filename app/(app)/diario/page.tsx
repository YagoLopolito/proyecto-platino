import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import DiaryTimeline from "@/components/diary/DiaryTimeline";
import MarkAsFinishedModal from "@/components/diary/MarkAsFinishedModal";
import AddFriendModal from "@/components/friends/AddFriendModal";
import {
  FriendsDiaryGrid,
  FRIENDS_FEED_PREVIEW_LIMIT,
} from "@/components/friends/FriendsDiaryGrid";
import { getFriendsDiaryFeed } from "@/lib/friends/queries";
import { ErrorState } from "@/components/ErrorState";
import Link from "next/link";
import ImportPlatinumsButton from "@/components/diary/ImportPlatinumsButton";
import RecommendationsSection from "@/components/diary/RecommendationsSection";
import { getCachedRecommendations } from "@/lib/diary/recommendations";
import { SectionHeader, SectionAction } from "@/components/ui/SectionHeader";

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

  // Las dos consultas no dependen entre sí (ver convención de Promise.all en
  // CLAUDE.md, sección Performance).
  const [outcome, friendsOutcome, cachedRecommendations] = await Promise.all([
    getUserDiaryEntries(supabase, user.id),
    getFriendsDiaryFeed(supabase, user.id),
    getCachedRecommendations(supabase, user.id),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-6 text-zinc-50 sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        {/*
         * En mobile las acciones son una fila de chips que scrollea con el
         * dedo (antes eran botones grandes apilados en dos columnas: cuatro
         * acciones secundarias empujaban el contenido del diario fuera de la
         * pantalla). A partir de `sm` vuelven a la derecha del título.
         */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">Mi diario</h1>
            <p className="text-sm text-zinc-400">
              Todas tus partidas terminadas, de la más reciente a la más vieja.
            </p>
          </div>
          {/* `-mx-4 px-4`: la fila sangra hasta los bordes de la pantalla para
              que se note que hay más chips a la derecha. */}
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <Link
              href="/diario/resumen"
              className="flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border border-zinc-700 px-3 text-sm text-zinc-300 hover:border-zinc-500"
            >
              📊 Resumen del año
            </Link>
            <Link
              href="/diario/capturas"
              className="flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border border-zinc-700 px-3 text-sm text-zinc-300 hover:border-zinc-500"
            >
              📷 Importar capturas
            </Link>
            <ImportPlatinumsButton />
            <MarkAsFinishedModal defaultOpen={nuevo === "1"} />
          </div>
        </div>

        <section className="space-y-3">
          <SectionHeader
            title="Jugados por amigos"
            action={
              <Link href="/diario/amigos">
                <SectionAction>Ver todo</SectionAction>
              </Link>
            }
          />
          {/* Agregar amigo va dentro de la sección, no en una fila propia:
              una fila entera para un solo botón secundario era puro alto. */}
          <div className="flex justify-end">
            <AddFriendModal />
          </div>

          {friendsOutcome.status === "error" ? (
            <ErrorState
              message={`No se pudo cargar el diario de tus amigos: ${friendsOutcome.message}`}
            />
          ) : (
            <FriendsDiaryGrid
              friends={friendsOutcome.friends}
              entries={friendsOutcome.entries}
              limit={FRIENDS_FEED_PREVIEW_LIMIT}
            />
          )}
        </section>
        <RecommendationsSection
          recommendations={cachedRecommendations?.recommendations ?? null}
          games={[...(cachedRecommendations?.gamesById.values() ?? [])]}
          generatedAt={cachedRecommendations?.createdAt ?? null}
        />

        {/*
         * El feed de amigos va arriba: el timeline propio crece sin techo y,
         * con muchas partidas cargadas, empujaba el feed fuera de la pantalla.
         */}
        <section className="space-y-3 pt-2">
          <SectionHeader title="Mis partidas" />
          {outcome.status === "error" ? (
            <ErrorState message={`No se pudo cargar el diario: ${outcome.message}`} />
          ) : (
            <DiaryTimeline entries={outcome.entries} />
          )}
        </section>
      </div>
    </div>
  );
}
