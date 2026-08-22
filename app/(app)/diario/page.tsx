import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import DiaryTimeline from "@/components/diary/DiaryTimeline";
import { ErrorState } from "@/components/ErrorState";

export default async function DiaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const outcome = await getUserDiaryEntries(supabase, user.id);

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-8 sm:py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Mi diario</h1>
            <p className="text-sm text-zinc-400">
              Todas tus partidas terminadas, de la más reciente a la más vieja.
            </p>
          </div>
          <Link
            href="/diario/nuevo"
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            ✓ Marcar terminado
          </Link>
        </div>

        {outcome.status === "error" ? (
          <ErrorState message={`No se pudo cargar el diario: ${outcome.message}`} />
        ) : (
          <DiaryTimeline entries={outcome.entries} />
        )}
      </div>
    </div>
  );
}
