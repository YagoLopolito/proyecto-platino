import type { DiaryTimelineEntry } from "@/lib/diary/queries";

export const MONTH_NAMES = [
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

export interface MonthSummary {
  /** 1-12. */
  month: number;
  monthName: string;
  finishedCount: number;
  platinumCount: number;
  averageRating: number | null;
  entries: DiaryTimelineEntry[];
}

export interface YearSummary {
  year: number;
  finishedCount: number;
  platinumCount: number;
  averageRating: number | null;
  /** Mejor rateados por el propio usuario, de mayor a menor (máximo 5). */
  topRated: DiaryTimelineEntry[];
  busiestMonth: MonthSummary | null;
  months: MonthSummary[];
}

const TOP_RATED_LIMIT = 5;

/**
 * `finished_on` es una columna `date` (string YYYY-MM-DD, sin timezone): se
 * parsea cortando el string, nunca con `new Date(...)`, que lo interpretaría en
 * UTC y podría correr el día -- misma regla que al escribirlo (ver CLAUDE.md).
 */
function yearOf(entry: DiaryTimelineEntry): number {
  return Number(entry.finishedOn.slice(0, 4));
}

function monthOf(entry: DiaryTimelineEntry): number {
  return Number(entry.finishedOn.slice(5, 7));
}

function average(entries: DiaryTimelineEntry[]): number | null {
  const rated = entries.filter((entry) => entry.rating !== null);
  if (rated.length === 0) return null;
  return rated.reduce((sum, entry) => sum + entry.rating!, 0) / rated.length;
}

/** Años con al menos una partida terminada, del más reciente al más viejo. */
export function availableYears(entries: DiaryTimelineEntry[]): number[] {
  return Array.from(new Set(entries.map(yearOf)))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a);
}

/**
 * Resumen anual ("Year in Review") calculado desde las mismas entradas que
 * alimentan el timeline de `/diario` -- nada mockeado, los números salen de
 * `game_diary_entries` y del platino derivado de los trofeos sincronizados.
 *
 * Los platinos se cuentan por juego distinto: una rejugada del mismo juego no
 * suma un platino más.
 */
export function summarizeYear(entries: DiaryTimelineEntry[], year: number): YearSummary {
  const yearEntries = entries.filter((entry) => yearOf(entry) === year);

  const months: MonthSummary[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const monthEntries = yearEntries.filter((entry) => monthOf(entry) === month);
    months.push({
      month,
      monthName: MONTH_NAMES[month - 1],
      finishedCount: monthEntries.length,
      platinumCount: new Set(
        monthEntries.filter((entry) => entry.isPlatinum).map((entry) => entry.gameId),
      ).size,
      averageRating: average(monthEntries),
      entries: monthEntries,
    });
  }

  const busiestMonth = months.reduce<MonthSummary | null>((best, current) => {
    if (current.finishedCount === 0) return best;
    return best === null || current.finishedCount > best.finishedCount ? current : best;
  }, null);

  return {
    year,
    finishedCount: yearEntries.length,
    platinumCount: new Set(
      yearEntries.filter((entry) => entry.isPlatinum).map((entry) => entry.gameId),
    ).size,
    averageRating: average(yearEntries),
    topRated: yearEntries
      .filter((entry) => entry.rating !== null)
      .sort((a, b) => b.rating! - a.rating!)
      .slice(0, TOP_RATED_LIMIT),
    busiestMonth,
    months,
  };
}

export interface AdvancedStats {
  /** Terminados por mes del año elegido (índice 0 = enero). */
  monthlyCounts: number[];
  /** Ratings propios del año agrupados por estrella (índice 0 = 1★ .. 4 = 5★). */
  ratingDistribution: number[];
  ratedCount: number;
  topPlatform: { platform: string; count: number } | null;
  /** Racha más larga de meses consecutivos con al menos un juego terminado (histórico). */
  longestMonthlyStreak: { months: number; from: string; to: string } | null;
}

/** Clave `YYYY-MM` -> índice absoluto de mes, para detectar meses consecutivos. */
function monthIndex(key: string): number {
  const [year, month] = key.split("-").map(Number);
  return year * 12 + (month - 1);
}

function monthKeyLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Estadísticas avanzadas del Letterbox (issue #97). El gráfico mensual, la
 * distribución de ratings y la plataforma más jugada son del año elegido; la
 * racha de meses consecutivos es histórica a propósito (cortarla por año
 * partiría al medio una racha que cruza diciembre-enero).
 */
export function advancedStats(entries: DiaryTimelineEntry[], year: number): AdvancedStats {
  const yearEntries = entries.filter((entry) => yearOf(entry) === year);

  const monthlyCounts = Array.from({ length: 12 }, (_, i) =>
    yearEntries.filter((entry) => monthOf(entry) === i + 1).length,
  );

  const ratingDistribution = [0, 0, 0, 0, 0];
  for (const entry of yearEntries) {
    if (entry.rating === null) continue;
    ratingDistribution[Math.min(5, Math.max(1, Math.ceil(entry.rating / 2))) - 1] += 1;
  }

  const platformCounts = new Map<string, number>();
  for (const entry of yearEntries) {
    if (!entry.platform) continue;
    platformCounts.set(entry.platform, (platformCounts.get(entry.platform) ?? 0) + 1);
  }
  const topPlatformEntry = [...platformCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const monthKeys = Array.from(new Set(entries.map((entry) => entry.finishedOn.slice(0, 7)))).sort();
  let longest: AdvancedStats["longestMonthlyStreak"] = null;
  let streakStart = 0;
  for (let i = 0; i < monthKeys.length; i += 1) {
    const isContinuation = i > 0 && monthIndex(monthKeys[i]) === monthIndex(monthKeys[i - 1]) + 1;
    if (!isContinuation) streakStart = i;
    const months = i - streakStart + 1;
    if (longest === null || months > longest.months) {
      longest = {
        months,
        from: monthKeyLabel(monthKeys[streakStart]),
        to: monthKeyLabel(monthKeys[i]),
      };
    }
  }

  return {
    monthlyCounts,
    ratingDistribution,
    ratedCount: ratingDistribution.reduce((sum, count) => sum + count, 0),
    topPlatform: topPlatformEntry
      ? { platform: topPlatformEntry[0], count: topPlatformEntry[1] }
      : null,
    longestMonthlyStreak: longest,
  };
}
