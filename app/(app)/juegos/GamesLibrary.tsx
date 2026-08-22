"use client";

import { useMemo } from "react";
import Link from "next/link";
import { GameCard } from "@/components/GameCard";
import { EmptyState } from "@/components/EmptyState";
import type { TrophyType } from "@/components/TrophyTypeIcon";
import { boolean, oneOf, useUrlFilterState } from "@/lib/hooks/useUrlFilterState";

export type LibraryGame = {
  id: string;
  name: string;
  platform: string | null;
  imageUrl: string | null;
  addedAt: string;
  lastPlayedAt: string | null;
  total: number;
  obtained: number;
  percent: number;
  counts: Record<TrophyType, number>;
};

type SortOption = "recent" | "name" | "percent";
type SortDirection = "asc" | "desc";
type FilterOption = "all" | "platinum" | "over50";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Jugados recientemente" },
  { value: "name", label: "Nombre" },
  { value: "percent", label: "% completado" },
];

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "platinum", label: "Platinados" },
  { value: "over50", label: "+50% progreso" },
];

/** Orden de cada criterio cuando la dirección es "desc" (la que muestra el botón al elegirlo por primera vez). */
function compareDescending(a: LibraryGame, b: LibraryGame, sort: SortOption): number {
  if (sort === "name") return b.name.localeCompare(a.name);
  if (sort === "percent") return b.percent - a.percent;

  const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : null;
  const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : null;
  if (aTime !== null && bTime !== null) return bTime - aTime;
  if (aTime !== null) return -1;
  if (bTime !== null) return 1;
  return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
}

function sortGames(games: LibraryGame[], sort: SortOption, direction: SortDirection): LibraryGame[] {
  const sorted = [...games].sort((a, b) => compareDescending(a, b, sort));
  return direction === "asc" ? sorted.reverse() : sorted;
}

function filterGames(games: LibraryGame[], filter: FilterOption): LibraryGame[] {
  if (filter === "platinum") return games.filter((game) => game.counts.platinum > 0);
  if (filter === "over50") return games.filter((game) => game.percent > 50);
  return games;
}

export default function GamesLibrary({ games }: { games: LibraryGame[] }) {
  // Los filtros viven en la query string para sobrevivir al "atrás" del
  // browser (volver desde el detalle de un juego) y al reload -- ver
  // useUrlFilterState.
  const [sort, setSort] = useUrlFilterState<SortOption>(
    "orden",
    "recent",
    oneOf(SORT_OPTIONS.map((option) => option.value)),
  );
  const [direction, setDirection] = useUrlFilterState<SortDirection>(
    "dir",
    "desc",
    oneOf(["asc", "desc"] as const),
  );
  const [filter, setFilter] = useUrlFilterState<FilterOption>(
    "filtro",
    "all",
    oneOf(FILTER_OPTIONS.map((option) => option.value)),
  );
  const [hidePlatinum, setHidePlatinum] = useUrlFilterState("sinPlatino", false, boolean);
  const [hideUnstarted, setHideUnstarted] = useUrlFilterState("sinEmpezar", false, boolean);

  const visibleGames = useMemo(() => {
    const filtered = filterGames(games, filter);
    const withoutPlatinum = hidePlatinum
      ? filtered.filter((game) => game.counts.platinum === 0)
      : filtered;
    const withoutUnstarted = hideUnstarted
      ? withoutPlatinum.filter((game) => game.percent > 0)
      : withoutPlatinum;
    return sortGames(withoutUnstarted, sort, direction);
  }, [games, sort, direction, filter, hidePlatinum, hideUnstarted]);

  function handleSortClick(option: SortOption) {
    if (option === sort) {
      setDirection(direction === "desc" ? "asc" : "desc");
    } else {
      setSort(option);
      setDirection("desc");
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Juegos {games.length > 0 && `(${visibleGames.length}/${games.length})`}
        </h2>

        {games.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSortClick(option.value)}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  sort === option.value
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                }`}
              >
                {option.label}
                {sort === option.value && <span>{direction === "desc" ? "↓" : "↑"}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {games.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`rounded-full border px-3 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  filter === option.value
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={hidePlatinum}
                onChange={(event) => setHidePlatinum(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              />
              Ocultar platinados
            </label>

            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={hideUnstarted}
                onChange={(event) => setHideUnstarted(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              />
              Ocultar en 0%
            </label>
          </div>
        </div>
      )}

      {games.length === 0 && (
        <EmptyState
          title={
            <>
              Todavía no hay juegos.{" "}
              <Link href="/psn" className="text-blue-400 hover:underline">
                Conectá tu cuenta PSN
              </Link>{" "}
              para traerlos automáticamente.
            </>
          }
        />
      )}

      {games.length > 0 && visibleGames.length === 0 && (
        <EmptyState title="Ningún juego coincide con este filtro." />
      )}

      <ul className="space-y-3">
        {visibleGames.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </ul>
    </section>
  );
}
