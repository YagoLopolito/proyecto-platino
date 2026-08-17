import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddTrophyForm from "./AddTrophyForm";
import AddTrophiesBatchForm from "./AddTrophiesBatchForm";
import { markTrophyObtained, unmarkTrophyObtained } from "./actions";

const TYPE_LABEL: Record<string, string> = {
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
  platinum: "Platino",
};

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("user_games")
    .select("game_id")
    .eq("user_id", user.id)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, name, platform")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    notFound();
  }

  const { data: trophies, error: trophiesError } = await supabase
    .from("trophies")
    .select("id, name, description, type, hidden")
    .eq("game_id", gameId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const { data: userTrophies } = await supabase
    .from("user_trophies")
    .select("trophy_id, unlocked_at")
    .eq("user_id", user.id);

  const obtained = new Map((userTrophies ?? []).map((row) => [row.trophy_id, row.unlocked_at]));
  const total = trophies?.length ?? 0;
  const obtainedCount = trophies?.filter((t) => obtained.has(t.id)).length ?? 0;
  const percent = total > 0 ? Math.round((obtainedCount / total) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{game.name}</h1>
          <p className="text-sm text-zinc-400">{game.platform}</p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Completitud</span>
            <span className="font-medium">
              {obtainedCount}/{total} ({percent}%)
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-blue-600" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <AddTrophyForm gameId={gameId} />
        <AddTrophiesBatchForm gameId={gameId} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Trofeos {total > 0 && `(${total})`}</h2>

          {trophiesError && (
            <p role="alert" className="text-sm text-red-400">
              No se pudieron cargar los trofeos: {trophiesError.message}
            </p>
          )}

          {!trophiesError && total === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              Todavía no cargaste trofeos para este juego.
            </p>
          )}

          <ul className="space-y-2">
            {trophies?.map((trophy) => {
              const isObtained = obtained.has(trophy.id);
              return (
                <li
                  key={trophy.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {trophy.name}
                      {trophy.hidden && (
                        <span className="ml-2 text-xs text-zinc-500">(oculto)</span>
                      )}
                    </p>
                    {trophy.description && (
                      <p className="truncate text-xs text-zinc-500">{trophy.description}</p>
                    )}
                    <p className="text-xs text-zinc-500">{TYPE_LABEL[trophy.type] ?? trophy.type}</p>
                  </div>
                  <form action={isObtained ? unmarkTrophyObtained : markTrophyObtained}>
                    <input type="hidden" name="trophyId" value={trophy.id} />
                    <input type="hidden" name="gameId" value={gameId} />
                    <button
                      type="submit"
                      className={
                        isObtained
                          ? "shrink-0 rounded border border-green-700 bg-green-900/30 px-3 py-1 text-sm text-green-400 hover:border-red-500 hover:text-red-400"
                          : "shrink-0 rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:border-blue-500 hover:text-blue-400"
                      }
                    >
                      {isObtained ? "Obtenido ✓" : "Marcar obtenido"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>

        <Link href="/juegos" className="text-sm text-blue-400 hover:underline">
          ← Volver a mi biblioteca
        </Link>
      </div>
    </div>
  );
}
