"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { removeGame } from "./actions";
import { TrophyTypeIcon, type TrophyType } from "@/components/TrophyTypeIcon";

const TROPHY_TYPES: TrophyType[] = ["platinum", "gold", "silver", "bronze"];

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

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Jugados recientemente" },
  { value: "name", label: "Nombre" },
  { value: "percent", label: "% completado" },
];

function sortGames(games: LibraryGame[], sort: SortOption): LibraryGame[] {
  return [...games].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "percent") return b.percent - a.percent;

    const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : null;
    const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : null;
    if (aTime !== null && bTime !== null) return bTime - aTime;
    if (aTime !== null) return -1;
    if (bTime !== null) return 1;
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });
}

export default function GamesLibrary({ games }: { games: LibraryGame[] }) {
  const [sort, setSort] = useState<SortOption>("recent");
  const sortedGames = useMemo(() => sortGames(games, sort), [games, sort]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Juegos {games.length > 0 && `(${games.length})`}
        </h2>

        {games.length > 1 && (
          <div className="flex items-center gap-1 text-xs">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSort(option.value)}
                className={`rounded-full border px-3 py-1 ${
                  sort === option.value
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {games.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Todavía no hay juegos.{" "}
          <Link href="/psn" className="text-blue-400 hover:underline">
            Conectá tu cuenta PSN
          </Link>{" "}
          para traerlos automáticamente.
        </p>
      )}

      <ul className="space-y-3">
        {sortedGames.map((game) => (
          <li
            key={game.id}
            className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <Link href={`/juegos/${game.id}`} className="shrink-0">
              {game.imageUrl ? (
                <Image
                  src={game.imageUrl}
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

              {game.total > 0 ? (
                <>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full bg-blue-600"
                      style={{ width: `${game.percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>
                      {game.obtained}/{game.total} ({game.percent}%)
                    </span>
                    <span className="flex items-center gap-2">
                      {TROPHY_TYPES.map((type) => (
                        <span key={type} className="flex items-center gap-0.5">
                          <TrophyTypeIcon type={type} className="h-3.5 w-3.5" />
                          {game.counts[type]}
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
        ))}
      </ul>
    </section>
  );
}
