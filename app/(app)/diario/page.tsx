import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import DiaryTimeline from "@/components/diary/DiaryTimeline";
import MarkAsFinishedModal from "@/components/diary/MarkAsFinishedModal";
import AddFriendModal from "@/components/friends/AddFriendModal";
import { FriendsDiaryGrid, FRIENDS_FEED_PREVIEW_LIMIT } from "@/components/friends/FriendsDiaryGrid";
import { getFriendsDiaryFeed } from "@/lib/friends/queries";
import { ErrorState } from "@/components/ErrorState";
import Link from "next/link";
import ImportPlatinumsButton from "@/components/diary/ImportPlatinumsButton";

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
  const [outcome, friendsOutcome] = await Promise.all([
    getUserDiaryEntries(supabase, user.id),
    getFriendsDiaryFeed(supabase, user.id),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-6 sm:py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        {/*
          * En mobile el encabezado se apila y las acciones ocupan el ancho
          * completo (a partir de `sm` vuelven a la derecha del título): con tres
          * botones en una fila de 375px quedaban partidos y sin área táctil.
          */}
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">Mi diario</h1>
            <p className="text-sm text-zinc-400">
              Todas tus partidas terminadas, de la más reciente a la más vieja.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
            <Link
              href="/diario/resumen"
              className="block rounded border border-zinc-700 px-3 py-2 text-center text-sm text-zinc-300 hover:border-zinc-500 sm:py-1.5"
            >
              📊 Resumen del año
            </Link>
            <ImportPlatinumsButton />
            <MarkAsFinishedModal defaultOpen={nuevo === "1"} />
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Jugados por amigos</h2>
              <p className="text-sm text-zinc-400">
                Las últimas {FRIENDS_FEED_PREVIEW_LIMIT} partidas de los usuarios que agregaste.
                Entrá a una carátula para leer la reseña.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
              <Link
                href="/diario/amigos"
                className="block rounded border border-zinc-700 px-3 py-2 text-center text-sm text-zinc-300 hover:border-zinc-500 sm:py-1.5"
              >
                ⚡ Toda la actividad
              </Link>
              <AddFriendModal />
            </div>
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
        {/*
          * El feed de amigos va arriba: el timeline propio crece sin techo y,
          * con muchas partidas cargadas, empujaba el feed fuera de la pantalla.
          */}
        <section className="space-y-4 border-t border-zinc-800 pt-6 sm:pt-8">
          <h2 className="text-lg font-semibold">Mis partidas</h2>
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
