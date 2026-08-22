import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddDiaryEntryForm from "@/components/diary/AddDiaryEntryForm";
import EditDiaryEntryForm from "@/components/diary/EditDiaryEntryForm";
import GameBreadcrumb from "@/components/GameBreadcrumb";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { GameScore } from "@/components/diary/GameScore";

export default async function GameDiaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, name")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    notFound();
  }

  // El diario es público (a diferencia de user_trophies) -- se muestran las
  // entradas de todos los usuarios para este juego, ver CLAUDE.md.
  const [{ data: entries, error: entriesError }, { data: score }] = await Promise.all([
    supabase
      .from("game_diary_entries")
      .select("id, user_id, playthrough_number, rating, review, finished_on")
      .eq("game_id", gameId)
      .order("finished_on", { ascending: false }),
    supabase.from("game_scores").select("average_rating, rating_count").eq("game_id", gameId).maybeSingle(),
  ]);

  const ownEntries = (entries ?? []).filter((entry) => entry.user_id === user.id);
  const otherEntries = (entries ?? []).filter((entry) => entry.user_id !== user.id);

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-8 sm:py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <GameBreadcrumb gameId={gameId} gameName={game.name} current="Diario" />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Diario de {game.name}</h1>
          <p className="text-sm text-zinc-400">
            Registro público de partidas terminadas. Podés agregar rejugadas y editar o borrar
            tus propias entradas.
          </p>
          <GameScore score={score} />
        </div>

        <AddDiaryEntryForm gameId={gameId} />

        <section className="space-y-4">
          {entriesError && (
            <p role="alert" className="text-sm text-red-400">
              No se pudieron cargar las entradas: {entriesError.message}
            </p>
          )}

          {!entriesError && ownEntries.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-300">Tus entradas</h2>
              {ownEntries.map((entry) => (
                <EditDiaryEntryForm key={entry.id} gameId={gameId} entry={entry} />
              ))}
            </div>
          )}

          {!entriesError && otherEntries.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-300">Otros usuarios</h2>
              {otherEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300"
                >
                  <span className="inline-flex items-center gap-2">
                    <span>
                      Partida #{entry.playthrough_number} · {entry.finished_on}
                    </span>
                    <StarRatingDisplay rating={entry.rating} />
                  </span>
                  {entry.review && <p className="mt-1 text-xs text-zinc-500">{entry.review}</p>}
                </div>
              ))}
            </div>
          )}

          {!entriesError && (entries ?? []).length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              Todavía nadie marcó este juego como terminado. Sé el primero.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
