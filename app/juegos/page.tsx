import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { removeGame } from "./actions";
import { TrophyTypeIcon, type TrophyType } from "@/components/TrophyTypeIcon";

const TROPHY_TYPES: TrophyType[] = ["platinum", "gold", "silver", "bronze"];

type GameStats = {
  total: number;
  obtained: number;
  percent: number;
  counts: Record<TrophyType, number>;
};

type SortOption = "recent" | "name" | "percent";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Jugados recientemente" },
  { value: "name", label: "Nombre" },
  { value: "percent", label: "% completado" },
];

export default async function JuegosPage({
  searchParams,
}: {
  searchParams?: Promise<{ sort?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const sort: SortOption =
    resolvedSearchParams?.sort === "name" || resolvedSearchParams?.sort === "percent"
      ? resolvedSearchParams.sort
      : "recent";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: library, error } = await supabase
    .from("user_games")
    .select("added_at, last_played_at, games (id, name, platform, cover_url, icon_url)")
    .order("last_played_at", { ascending: false, nullsFirst: false })
    .order("added_at", { ascending: false });

  const gameIds = (library ?? []).map((row) => row.games?.id).filter((id): id is string => !!id);

  const statsByGame = new Map<string, GameStats>();

  if (gameIds.length > 0) {
    const PAGE_SIZE = 1000;
    const trophies: { id: string; game_id: string; type: string }[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page } = await supabase
        .from("trophies")
        .select("id, game_id, type")
        .in("game_id", gameIds)
        .range(from, from + PAGE_SIZE - 1);
      trophies.push(...(page ?? []));
      if (!page || page.length < PAGE_SIZE) break;
    }

    const { data: userTrophies } = await supabase
      .from("user_trophies")
      .select("trophy_id")
      .eq("user_id", user.id);

    const obtainedIds = new Set((userTrophies ?? []).map((row) => row.trophy_id));

    for (const gameId of gameIds) {
      statsByGame.set(gameId, {
        total: 0,
        obtained: 0,
        percent: 0,
        counts: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
      });
    }

    for (const trophy of trophies ?? []) {
      const stats = statsByGame.get(trophy.game_id);
      if (!stats) continue;
      stats.total += 1;
      const obtained = obtainedIds.has(trophy.id);
      if (obtained) {
        stats.obtained += 1;
        if (trophy.type in stats.counts) {
          stats.counts[trophy.type as TrophyType] += 1;
        }
      }
    }

    for (const stats of statsByGame.values()) {
      stats.percent = stats.total > 0 ? Math.round((stats.obtained / stats.total) * 100) : 0;
    }
  }

  const sortedLibrary = [...(library ?? [])].sort((a, b) => {
    if (sort === "name") {
      return (a.games?.name ?? "").localeCompare(b.games?.name ?? "");
    }

    if (sort === "percent") {
      const aPercent = a.games ? (statsByGame.get(a.games.id)?.percent ?? 0) : 0;
      const bPercent = b.games ? (statsByGame.get(b.games.id)?.percent ?? 0) : 0;
      return bPercent - aPercent;
    }

    const aTime = a.last_played_at ? new Date(a.last_played_at).getTime() : null;
    const bTime = b.last_played_at ? new Date(b.last_played_at).getTime() : null;
    if (aTime !== null && bTime !== null) return bTime - aTime;
    if (aTime !== null) return -1;
    if (bTime !== null) return 1;
    return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
  });

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Juegos {library && library.length > 0 && `(${library.length})`}
            </h2>

            {library && library.length > 1 && (
              <div className="flex items-center gap-1 text-xs">
                {SORT_OPTIONS.map((option) => (
                  <Link
                    key={option.value}
                    href={option.value === "recent" ? "/juegos" : `/juegos?sort=${option.value}`}
                    className={`rounded-full border px-3 py-1 ${
                      sort === option.value
                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

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

          <ul className="space-y-3">
            {sortedLibrary.map(({ games: game }) => {
              if (!game) return null;
              const stats = statsByGame.get(game.id);
              const imageUrl = game.cover_url ?? game.icon_url;

              return (
                <li
                  key={game.id}
                  className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <Link href={`/juegos/${game.id}`} className="shrink-0">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={game.name}
                        width={56}
                        height={56}
                        unoptimized
                        className="h-14 w-14 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded bg-zinc-800 text-xs text-zinc-500">
                        Sin img
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1 space-y-2">
                    <Link href={`/juegos/${game.id}`} className="block min-w-0 hover:underline">
                      <p className="truncate font-medium">{game.name}</p>
                      <p className="text-xs text-zinc-500">{game.platform}</p>
                    </Link>

                    {stats && stats.total > 0 ? (
                      <>
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${stats.percent}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span>
                            {stats.obtained}/{stats.total} ({stats.percent}%)
                          </span>
                          <span className="flex items-center gap-2">
                            {TROPHY_TYPES.map((type) => (
                              <span key={type} className="flex items-center gap-0.5">
                                <TrophyTypeIcon type={type} className="h-3.5 w-3.5" />
                                {stats.counts[type]}
                              </span>
                            ))}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-500">Sin trofeos cargados todavía.</p>
                    )}
                  </div>

                  <form action={removeGame} className="shrink-0">
                    <input type="hidden" name="gameId" value={game.id} />
                    <button
                      type="submit"
                      className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:border-red-500 hover:text-red-400"
                    >
                      Quitar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>

        <Link href="/perfil" className="text-sm text-blue-400 hover:underline">
          ← Volver al perfil
        </Link>
      </div>
    </div>
  );
}
