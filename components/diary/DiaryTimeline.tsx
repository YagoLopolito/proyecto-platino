"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { DiaryTimelineEntry } from "@/lib/diary/queries";
import { StarRatingDisplay, type RatingTone } from "@/components/diary/StarRating";
import { GameArt } from "@/components/game/GameArt";
import { TrophyTypeIcon } from "@/components/TrophyTypeIcon";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { reviewFocusHref } from "@/lib/game-page/review-focus";
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
 * Diario (epic #183, issue #197), con el formato del diario de Letterboxd:
 * cabeceras de mes pegajosas y, por partida, una fila con el **día** en un
 * recuadro, la carátula chica, el nombre del juego en la serif con su año y
 * las marcas (estrellas, reseña, platino/100%, rejugada). Tocar la fila abre la
 * ficha del juego con esa entrada enfocada.
 *
 * Los filtros (año, plataforma, rating) siguen siendo client-side: el diario de
 * un usuario es un dataset chico y así no hay round-trip por filtro. Viven en
 * la URL (`useUrlFilterState`) para sobrevivir al "atrás" y al reload. En
 * mobile van en una hoja detrás del ícono de filtro; en escritorio, en línea.
 */
export default function DiaryTimeline({
  entries,
  ratingTone = "own",
  empty,
}: {
  entries: DiaryTimelineEntry[];
  /** `others` en el diario de otro usuario: sus estrellas no son "lo que hiciste". */
  ratingTone?: RatingTone;
  /** Qué mostrar sin ninguna entrada (el propio invita a registrar; el ajeno no). */
  empty: ReactNode;
}) {
  const [year, setYear] = useUrlFilterState<string>("anio", ANY, text);
  const [platform, setPlatform] = useUrlFilterState<string>("plataforma", ANY, text);
  const [minRating, setMinRating] = useUrlFilterState<string>("rating", ANY, text);
  const [sheetOpen, setSheetOpen] = useState(false);

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
  // (un link viejo con `?anio=2023`). Se degrada a "todos" durante el render --
  // no con un setState en un effect, ver react-hooks/set-state-in-effect.
  const activeYear = year === ANY || years.includes(year) ? year : ANY;
  const activePlatform = platform === ANY || platforms.includes(platform) ? platform : ANY;
  const activeCount = [activeYear, activePlatform, minRating].filter((v) => v !== ANY).length;

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

  // Las entradas ya vienen ordenadas (finished_on desc, created_at desc); el
  // Map conserva ese orden dentro de cada mes.
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

  if (entries.length === 0) return <>{empty}</>;

  function filterControls(idPrefix: string) {
    return (
      <>
        <label className="sr-only" htmlFor={`${idPrefix}-year`}>
          Filtrar por año
        </label>
        <Select
          id={`${idPrefix}-year`}
          value={activeYear}
          onChange={(e) => setYear(e.target.value)}
          className="w-full sm:w-auto"
        >
          <option value={ANY}>Todos los años</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>

        <label className="sr-only" htmlFor={`${idPrefix}-platform`}>
          Filtrar por plataforma
        </label>
        <Select
          id={`${idPrefix}-platform`}
          value={activePlatform}
          onChange={(e) => setPlatform(e.target.value)}
          className="w-full sm:w-auto"
        >
          <option value={ANY}>Todas las plataformas</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>

        <label className="sr-only" htmlFor={`${idPrefix}-rating`}>
          Filtrar por rating
        </label>
        <Select
          id={`${idPrefix}-rating`}
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
          className="w-full sm:w-auto"
        >
          <option value={ANY}>Cualquier rating</option>
          <option value="8">4 estrellas o más</option>
          <option value="6">3 estrellas o más</option>
          <option value="4">2 estrellas o más</option>
          <option value="none">Sin rating</option>
        </Select>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="type-meta text-ink-faint">
          {filtered.length} de {entries.length}
        </span>
        {/* Mobile: el ícono de filtro abre una hoja con los tres selects. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          className="relative flex h-11 w-11 items-center justify-center rounded-chip text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:hidden"
        >
          <Icon name="filters" className="h-5 w-5" label="Filtros del diario" />
          {activeCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 type-caption leading-none text-white">
              {activeCount}
            </span>
          )}
        </button>
        <div className="hidden items-center gap-2 sm:flex">{filterControls("diary-filter")}</div>
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filtros">
        <div className="flex flex-col gap-3 p-4">{filterControls("diary-sheet-filter")}</div>
      </BottomSheet>

      {filtered.length === 0 && (
        <p className="rounded-card border border-dashed border-border p-8 text-center type-body text-ink-muted">
          Ninguna entrada coincide con los filtros.
        </p>
      )}

      {groups.map(([key, monthEntries]) => (
        <section key={key} aria-label={monthLabel(key)} data-testid="diary-month">
          {/* Pegajosa y a ancho completo, como en Letterboxd: al scrollear un
              mes largo sigue diciendo en qué mes estás. */}
          <h2 className="sticky top-0 z-10 -mx-4 bg-surface-raised px-4 py-2 type-overline text-ink-muted sm:mx-0 sm:rounded-chip">
            {monthLabel(key)}
          </h2>
          <ul className="divide-y divide-border">
            {monthEntries.map((entry) => (
              <li key={entry.id} data-testid="diary-entry">
                <DiaryRow entry={entry} ratingTone={ratingTone} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DiaryRow({ entry, ratingTone }: { entry: DiaryTimelineEntry; ratingTone: RatingTone }) {
  const { day } = parseDateParts(entry.finishedOn);
  return (
    <Link
      href={reviewFocusHref(entry.gameId, entry.id)}
      className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink sm:px-2"
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card border border-border-strong type-stat text-ink"
        data-testid="diary-day"
      >
        {day}
      </span>
      <span className="relative block aspect-[3/4] w-10 shrink-0 overflow-hidden rounded-chip bg-surface">
        {entry.imageUrl && (
          <GameArt
            src={entry.imageUrl}
            alt=""
            sizes="40px"
            className="object-cover"
            fallback={null}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block truncate">
          <span className="type-headline text-ink">{entry.gameName}</span>
          {entry.releaseYear && (
            <span className="ml-1.5 type-meta text-ink-muted">{entry.releaseYear}</span>
          )}
        </span>
        <span className="flex items-center gap-2 text-ink-faint">
          <StarRatingDisplay rating={entry.rating} tone={ratingTone} />
          {entry.review && <Icon name="note" className="h-3.5 w-3.5" label="Tiene reseña" />}
          {entry.isPlatinum && (
            <span role="img" aria-label="Platino" className="text-trophy-platinum">
              <TrophyTypeIcon type="platinum" className="h-3.5 w-3.5" />
            </span>
          )}
          {entry.isCompleted && (
            <Icon name="completed" className="h-3.5 w-3.5 text-success" label="100%" />
          )}
          {entry.playthroughNumber > 1 && (
            <Icon
              name="repeat"
              className="h-3.5 w-3.5"
              label={`Rejugada #${entry.playthroughNumber}`}
            />
          )}
        </span>
      </span>
    </Link>
  );
}
