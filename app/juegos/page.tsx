import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { removeGame } from "./actions";

export default async function JuegosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: library, error } = await supabase
    .from("user_games")
    .select("added_at, games (id, name, platform)")
    .order("added_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Mi biblioteca</h1>
          <p className="text-sm text-zinc-400">
            Tus juegos y trofeos se traen automáticamente desde tu cuenta PSN.{" "}
            <Link href="/psn" className="text-blue-400 hover:underline">
              Sincronizar ahora
            </Link>
            .
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Juegos {library && library.length > 0 && `(${library.length})`}
          </h2>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              No se pudo cargar la biblioteca: {error.message}
            </p>
          )}

          {!error && (!library || library.length === 0) && (
            <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              Todavía no hay juegos.{" "}
              <Link href="/psn" className="text-blue-400 hover:underline">
                Conectá tu cuenta PSN
              </Link>{" "}
              para traerlos automáticamente.
            </p>
          )}

          <ul className="space-y-2">
            {library?.map(({ games: game }) =>
              game ? (
                <li
                  key={game.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <Link href={`/juegos/${game.id}`} className="min-w-0 hover:underline">
                    <p className="truncate font-medium">{game.name}</p>
                    <p className="text-xs text-zinc-500">{game.platform}</p>
                  </Link>
                  <form action={removeGame}>
                    <input type="hidden" name="gameId" value={game.id} />
                    <button
                      type="submit"
                      className="shrink-0 rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:border-red-500 hover:text-red-400"
                    >
                      Quitar
                    </button>
                  </form>
                </li>
              ) : null,
            )}
          </ul>
        </section>

        <Link href="/perfil" className="text-sm text-blue-400 hover:underline">
          ← Volver al perfil
        </Link>
      </div>
    </div>
  );
}
