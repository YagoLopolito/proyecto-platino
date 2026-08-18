import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddGuideForm from "./AddGuideForm";
import AddStepForm from "./AddStepForm";
import EditGuideForm from "./EditGuideForm";
import EditStepForm from "./EditStepForm";
import { deleteGuide, deleteStep, toggleStepProgress } from "./actions";
import GameBreadcrumb from "@/components/GameBreadcrumb";

export default async function GameGuidesPage({ params }: { params: Promise<{ id: string }> }) {
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

  const PAGE_SIZE = 1000;
  const userTrophies: { trophy_id: string }[] = [];

  const [{ data: trophies }, { data: guides, error: guidesError }] = await Promise.all([
    supabase.from("trophies").select("id, name").eq("game_id", gameId),
    supabase
      .from("guides")
      .select(
        "id, title, content_markdown, external_url, source, author_id, created_at, guide_steps (id, content, step_order, trophy_id)",
      )
      .eq("game_id", gameId)
      .order("created_at", { ascending: true }),
    (async () => {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: page } = await supabase
          .from("user_trophies")
          .select("trophy_id")
          .eq("user_id", user.id)
          .order("id")
          .range(from, from + PAGE_SIZE - 1);
        userTrophies.push(...(page ?? []));
        if (!page || page.length < PAGE_SIZE) break;
      }
    })(),
  ]);

  const obtainedTrophyIds = new Set(userTrophies.map((row) => row.trophy_id));

  const { data: userProgress } = await supabase
    .from("user_guide_progress")
    .select("guide_step_id, completed")
    .eq("user_id", user.id);

  const completedStepIds = new Set(
    (userProgress ?? []).filter((row) => row.completed).map((row) => row.guide_step_id),
  );

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <GameBreadcrumb gameId={gameId} gameName={game.name} current="Guías" />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Guías de {game.name}</h1>
          <p className="text-sm text-zinc-400">
            Checklist de pasos para desbloquear trofeos. Marcalos a medida que los vas haciendo.
            Para guías de fuentes externas o generadas por IA, mirá{" "}
            <Link href={`/juegos/${gameId}/enlaces`} className="text-blue-400 hover:underline">
              enlaces externos
            </Link>{" "}
            y el advisor con IA en la página del juego.
          </p>
        </div>

        <details className="group rounded-lg border border-zinc-800 bg-zinc-900/50">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200">
            + Crear una guía propia (opcional)
          </summary>
          <div className="border-t border-zinc-800 p-4">
            <AddGuideForm gameId={gameId} />
          </div>
        </details>

        <section className="space-y-4">
          {guidesError && (
            <p role="alert" className="text-sm text-red-400">
              No se pudieron cargar las guías: {guidesError.message}
            </p>
          )}

          {!guidesError && (!guides || guides.length === 0) && (
            <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              Todavía no hay guías para este juego. Creá la primera arriba.
            </p>
          )}

          {guides?.map((guide) => {
            const isOwner = guide.author_id === user.id;
            const steps = [...(guide.guide_steps ?? [])].sort(
              (a, b) => a.step_order - b.step_order,
            );

            return (
              <div
                key={guide.id}
                className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  {isOwner ? (
                    <EditGuideForm gameId={gameId} guide={guide} />
                  ) : (
                    <div className="min-w-0">
                      <h2 className="font-semibold">{guide.title}</h2>
                      {guide.source && (
                        <p className="text-xs text-zinc-500">Fuente: {guide.source}</p>
                      )}
                      {guide.external_url && (
                        <a
                          href={guide.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline"
                        >
                          {guide.external_url}
                        </a>
                      )}
                      {guide.content_markdown && (
                        <pre className="mt-2 whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                          {guide.content_markdown}
                        </pre>
                      )}
                    </div>
                  )}
                  {isOwner && (
                    <form action={deleteGuide}>
                      <input type="hidden" name="guideId" value={guide.id} />
                      <input type="hidden" name="gameId" value={gameId} />
                      <button
                        type="submit"
                        className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-red-500 hover:text-red-400"
                      >
                        Borrar guía
                      </button>
                    </form>
                  )}
                </div>

                {steps.length > 0 && (
                  <ul className="space-y-1">
                    {steps.map((step) => {
                      const trophyDone = step.trophy_id
                        ? obtainedTrophyIds.has(step.trophy_id)
                        : false;
                      const done = trophyDone || completedStepIds.has(step.id);
                      return (
                        <li
                          key={step.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                        >
                          <form
                            action={toggleStepProgress}
                            className="flex min-w-0 flex-1 items-center gap-2"
                          >
                            <input type="hidden" name="stepId" value={step.id} />
                            <input type="hidden" name="gameId" value={gameId} />
                            <input type="hidden" name="completed" value={String(done)} />
                            <button
                              type="submit"
                              disabled={trophyDone}
                              aria-label={done ? "Destildar paso" : "Tildar paso"}
                              className={
                                done
                                  ? "flex h-5 w-5 shrink-0 items-center justify-center rounded border border-green-600 bg-green-900/40 text-green-400 disabled:cursor-default"
                                  : "flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-600 text-transparent hover:border-blue-500"
                              }
                            >
                              ✓
                            </button>
                            <span className={done ? "truncate text-zinc-500 line-through" : "truncate"}>
                              {step.content}
                            </span>
                          </form>
                          {isOwner && (
                            <div className="flex shrink-0 items-center gap-2">
                              <EditStepForm
                                gameId={gameId}
                                guideId={guide.id}
                                step={step}
                                trophies={trophies ?? []}
                              />
                              <form action={deleteStep}>
                                <input type="hidden" name="stepId" value={step.id} />
                                <input type="hidden" name="guideId" value={guide.id} />
                                <input type="hidden" name="gameId" value={gameId} />
                                <button
                                  type="submit"
                                  className="shrink-0 text-xs text-zinc-500 hover:text-red-400"
                                >
                                  Quitar
                                </button>
                              </form>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {isOwner && (
                  <AddStepForm
                    guideId={guide.id}
                    gameId={gameId}
                    nextOrder={steps.length}
                    trophies={trophies ?? []}
                  />
                )}
              </div>
            );
          })}
        </section>

        <div className="flex items-center justify-end">
          <Link
            href={`/juegos/${gameId}/enlaces`}
            className="text-sm text-blue-400 hover:underline"
          >
            Ver enlaces externos →
          </Link>
        </div>
      </div>
    </div>
  );
}
