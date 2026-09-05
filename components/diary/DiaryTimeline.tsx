"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { DiaryTimelineEntry } from "@/lib/diary/queries";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { text, useUrlFilterState } from "@/lib/hooks/useUrlFilterState";

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
  // En la query string para sobrevivir al "atrás" (volver desde el diario de
  // un juego) y al reload -- ver useUrlFilterState. Se validan contra las
  // opciones reales más abajo, no acá: año y plataforma dependen de las
  // entradas del usuario, así que la lista no se conoce de antemano.
  const [year, setYear] = useUrlFilterState<string>("anio", ANY, text);
  const [platform, setPlatform] = useUrlFilterState<string>("plataforma", ANY, text);
  const [minRating, setMinRating] = useUrlFilterState<string>("rating", ANY, text);

  const years = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => parseDateParts(e.finishedOn).year)))
        .sort()
        .reverse(),
    [entries],
  );
  const platforms = useMemo(
    () =>
      Array.from(
        new Set(entries.map((e) => e.platform).filter((p): p is string => Boolean(p))),
      ).sort(),
    [entries],
  );

  // Un valor que viene de la URL puede no existir entre las entradas actuales
  // (un link viejo con `?anio=2023`, o la última entrada de ese año borrada).
  // Se degrada a "todos" durante el render -- no con un setState en un effect,
  // ver la regla react-hooks/set-state-in-effect en CLAUDE.md -- para que el
  // <select> no quede en blanco ni el timeline vacío sin explicación.
  const activeYear = year === ANY || years.includes(year) ? year : ANY;
  const activePlatform = platform === ANY || platforms.includes(platform) ? platform : ANY;

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        if (activeYear !== ANY && parseDateParts(entry.finishedOn).year !== activeYear)
          return false;
        if (activePlatform !== ANY && entry.platform !== activePlatform) return false;
        if (minRating !== ANY) {
          if (minRating === "none") return entry.rating === null;
          if (entry.rating === null || entry.rating < Number(minRating)) return false;
        }
        return true;
      }),
    [entries, activeYear, activePlatform, minRating],
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
          <Link href="/diario?nuevo=1" className="text-blue-400 hover:underline">
            Marcar uno ahora
          </Link>
        }
      />
    );
  }

  // En mobile los tres filtros van uno por fila y a ancho completo: con
  // `flex-1` en una fila de 375px quedaban de ~100px y el texto de la opción
  // elegida se cortaba.
  const selectClass =
    "w-full min-w-0 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 sm:w-auto sm:flex-1 md:flex-none";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="sr-only" htmlFor="diary-filter-year">
          Filtrar por año
        </label>
        <select
          id="diary-filter-year"
          value={activeYear}
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
          value={activePlatform}
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

        <span className="text-sm text-zinc-500">
          {filtered.length} de {entries.length}
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Ninguna entrada coincide con los filtros.
        </p>
      )}

      {/*
       * Cada mes es una grilla de carátulas, como el diario de Letterbox: el
       * día y el rating van debajo de la carátula, y la reseña completa está
       * a un toque, en el diario del juego. Antes cada partida era una fila
       * con la reseña recortada, que en mobile daba scroll infinito para ver
       * cuatro juegos.
       */}
      {groups.map(([key, monthEntries]) => (
        <section key={key} className="space-y-3">
          <SectionHeader title={monthLabel(key)} />
          <PosterGrid>
            {monthEntries.map((entry) => {
              const { day } = parseDateParts(entry.finishedOn);
              return (
                <li key={entry.id} data-testid="diary-entry">
                  <GamePoster
                    href={`/juegos/${entry.gameId}/diario`}
                    name={entry.gameName}
                    imageUrl={entry.imageUrl}
                    isPlatinum={entry.isPlatinum}
                    isCompleted={entry.isCompleted}
                    overlay={
                      entry.playthroughNumber > 1 ? (
                        <span
                          className="absolute left-1 top-1 rounded bg-zinc-950/80 px-1 py-0.5 text-[10px] leading-none text-zinc-300 backdrop-blur-sm"
                          title={`Rejugada #${entry.playthroughNumber}`}
                        >
                          #{entry.playthroughNumber}
                        </span>
                      ) : undefined
                    }
                    caption={
                      <span className="flex flex-wrap items-center justify-between gap-x-1.5">
                        <StarRatingDisplay rating={entry.rating} />
                        <span className="flex items-center gap-1 text-zinc-600">
                          {entry.review && <span title="Tiene reseña">📝</span>}
                          {day}
                        </span>
                      </span>
                    }
                  />
                </li>
              );
            })}
          </PosterGrid>
        </section>
      ))}
    </div>
  );
}
