"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import type { DiaryTimelineEntry } from "@/lib/diary/queries";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { PlatinumBadge } from "@/components/PlatinumBadge";
import { EmptyState } from "@/components/EmptyState";
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
    () => Array.from(new Set(entries.map((e) => parseDateParts(e.finishedOn).year))).sort().reverse(),
    [entries],
  );
  const platforms = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.platform).filter((p): p is string => Boolean(p)))).sort(),
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
        if (activeYear !== ANY && parseDateParts(entry.finishedOn).year !== activeYear) return false;
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

      {groups.map(([key, monthEntries]) => (
        <section key={key} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {monthLabel(key)}
          </h2>
          <ul className="space-y-2">
            {monthEntries.map((entry) => {
              const { day } = parseDateParts(entry.finishedOn);
              return (
                <li key={entry.id}>
                  <Link
                    href={`/juegos/${entry.gameId}/diario`}
                    className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-600 sm:gap-4 sm:p-4"
                  >
                    <span className="w-5 shrink-0 text-center text-sm text-zinc-500 sm:w-7 sm:text-base">
                      {day}
                    </span>
                    {/* La carátula achica en mobile: a 96px de alto se comía
                        el ancho del texto en pantallas de 360-375px. */}
                    {entry.imageUrl ? (
                      <Image
                        src={entry.imageUrl}
                        alt={entry.gameName}
                        width={72}
                        height={96}
                        className="h-[72px] w-[54px] shrink-0 rounded object-cover sm:h-24 sm:w-18"
                      />
                    ) : (
                      <div className="flex h-[72px] w-[54px] shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-500 sm:h-24 sm:w-18">
                        Sin img
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* `truncate` no funciona en un contenedor flex-wrap y
                          además cortaba los badges: se corta por palabra. */}
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium break-words text-zinc-100 sm:text-base">
                        {entry.gameName}
                        {entry.isPlatinum && <PlatinumBadge />}
                        {entry.playthroughNumber > 1 && (
                          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            Rejugada #{entry.playthroughNumber}
                          </span>
                        )}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 sm:text-sm">
                        {entry.platform && <span>{entry.platform}</span>}
                        <StarRatingDisplay rating={entry.rating} />
                      </p>
                      {entry.review && (
                        // Recortada a 3 líneas: la idea es ver de un vistazo qué
                        // dijiste de esa partida; el texto completo está en el
                        // diario del juego, a un click de acá.
                        <p className="line-clamp-3 whitespace-pre-line text-xs leading-relaxed break-words text-zinc-400 sm:text-sm">
                          {entry.review}
                        </p>
                      )}
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
