"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { removeGame } from "./actions";
import { GameCard } from "@/components/GameCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import type { TrophyType } from "@/components/TrophyTypeIcon";

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
  const [sort, setSort] = useState<SortOption>("recent");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [filter, setFilter] = useState<FilterOption>("all");

  const visibleGames = useMemo(() => {
    const filtered = filterGames(games, filter);
    return sortGames(filtered, sort, direction);
  }, [games, sort, direction, filter]);

  function handleSortClick(option: SortOption) {
    if (option === sort) {
      setDirection((prev) => (prev === "desc" ? "asc" : "desc"));
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
          <div className="flex items-center gap-1 text-xs">
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
        <div className="flex items-center gap-1 text-xs">
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
          <GameCard
            key={game.id}
            game={game}
            actions={
              <form action={removeGame}>
                <input type="hidden" name="gameId" value={game.id} />
                <Button type="submit" variant="danger">
                  Quitar
                </Button>
              </form>
            }
          />
        ))}
      </ul>
    </section>
  );
}
