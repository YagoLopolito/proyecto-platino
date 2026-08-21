"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { DiaryTimelineEntry } from "@/lib/diary/queries";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { PlatinumBadge } from "@/components/PlatinumBadge";
import { EmptyState } from "@/components/EmptyState";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * `finished_on` es una columna `date` ("YYYY-MM-DD"): se parsea a mano y no
 * con `new Date(...)`, que la interpretaría como UTC y podría correr el día
 * (misma razón por la que la Server Action la guarda tal cual, ver CLAUDE.md).
 */
function parseDateParts(finishedOn: string): { year: string; month: number; day: number } {
  const [year, month, day] = finishedOn.split("-");
  return { year, month: Number(month), day: Number(day) };
}

function monthKey(finishedOn: string): string {
  const { year, month } = parseDateParts(finishedOn);
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${year}`;
}

const ANY = "all";

/**
 * Timeline cronológico del diario (issue #93): agrupado por mes y año, más
 * reciente primero, con filtros por año, plataforma y rating. Los filtros son
 * client-side a propósito: el diario propio de un usuario es un dataset chico
 * y así no hace falta un round-trip por cada cambio de filtro.
 */
export default function DiaryTimeline({ entries }: { entries: DiaryTimelineEntry[] }) {
  const [year, setYear] = useState<string>(ANY);
  const [platform, setPlatform] = useState<string>(ANY);
  const [minRating, setMinRating] = useState<string>(ANY);

  const years = useMemo(
    () => Array.from(new Set(entries.map((e) => parseDateParts(e.finishedOn).year))).sort().reverse(),
    [entries],
  );
  const platforms = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.platform).filter((p): p is string => Boolean(p)))).sort(),
    [entries],
  );

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        if (year !== ANY && parseDateParts(entry.finishedOn).year !== year) return false;
        if (platform !== ANY && entry.platform !== platform) return false;
        if (minRating !== ANY) {
          if (minRating === "none") return entry.rating === null;
          if (entry.rating === null || entry.rating < Number(minRating)) return false;
        }
        return true;
      }),
    [entries, year, platform, minRating],
  );

  const groups = useMemo(() => {
    const byMonth = new Map<string, DiaryTimelineEntry[]>();
    for (const entry of filtered) {
      const key = monthKey(entry.finishedOn);
      const bucket = byMonth.get(key);
      if (bucket) bucket.push(entry);
      else byMonth.set(key, [entry]);
    }
    return Array.from(byMonth.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Todavía no marcaste ningún juego como terminado."
        action={
          <Link href="/diario/nuevo" className="text-blue-400 hover:underline">
            Marcar uno ahora
          </Link>
        }
      />
    );
  }

  const selectClass =
    "rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="diary-filter-year">
          Filtrar por año
        </label>
        <select
          id="diary-filter-year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className={selectClass}
        >
          <option value={ANY}>Todos los años</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="diary-filter-platform">
          Filtrar por plataforma
        </label>
        <select
          id="diary-filter-platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={selectClass}
        >
          <option value={ANY}>Todas las plataformas</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="diary-filter-rating">
          Filtrar por rating
        </label>
        <select
          id="diary-filter-rating"
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
          className={selectClass}
        >
          <option value={ANY}>Cualquier rating</option>
          <option value="8">4★ o más</option>
          <option value="6">3★ o más</option>
          <option value="4">2★ o más</option>
          <option value="none">Sin rating</option>
        </select>

        <span className="text-xs text-zinc-500">
          {filtered.length} de {entries.length}
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Ninguna entrada coincide con los filtros.
        </p>
      )}

      {groups.map(([key, monthEntries]) => (
        <section key={key} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {monthLabel(key)}
          </h2>
          <ul className="space-y-2">
            {monthEntries.map((entry) => {
              const { day } = parseDateParts(entry.finishedOn);
              return (
                <li key={entry.id}>
                  <Link
                    href={`/juegos/${entry.gameId}/diario`}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-600"
                  >
                    <span className="w-6 shrink-0 text-center text-sm text-zinc-500">{day}</span>
                    {entry.imageUrl ? (
                      <Image
                        src={entry.imageUrl}
                        alt={entry.gameName}
                        width={48}
                        height={48}
                        className="h-12 w-12 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-500">
                        Sin img
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 truncate text-sm font-medium text-zinc-100">
                        {entry.gameName}
                        {entry.isPlatinum && <PlatinumBadge />}
                        {entry.playthroughNumber > 1 && (
                          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            Rejugada #{entry.playthroughNumber}
                          </span>
                        )}
                      </p>
                      <p className="flex items-center gap-2 text-xs text-zinc-500">
                        {entry.platform && <span>{entry.platform}</span>}
                        <StarRatingDisplay rating={entry.rating} />
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
