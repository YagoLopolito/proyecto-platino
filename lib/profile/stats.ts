/**
 * Cálculos de Perfil › Perfil (epic #183, issue #196): histograma de
 * puntuaciones, "juegos jugados" y los contadores de "este año".
 *
 * Módulo puro y sin `server-only` a propósito: lo testea el spec directo (como
 * `steam-relevance` o `near-platinum`) y no depende de Supabase.
 */

/**
 * Zona horaria con la que se decide a qué año pertenece un instante
 * (`timestamptz`: la fecha de un platino, de un 100%). El server no sabe dónde
 * está quien mira, y "este año" tiene que ser el mismo número en el celu y en
 * la PC; la app es de Argentina, así que se fija acá en vez de depender de la
 * zona del proceso (UTC en Vercel), que corría a enero los platinos de la noche
 * del 31 de diciembre.
 */
export const APP_TIME_ZONE = "America/Argentina/Buenos_Aires";

/**
 * Año de una columna `date` ("YYYY-MM-DD"). Se corta el string, nunca
 * `new Date(...)`: lo interpretaría en UTC y podría correr el día (misma regla
 * que `lib/diary/stats.ts`).
 */
export function yearOfDate(date: string): number {
  return Number(date.slice(0, 4));
}

/** Año de un instante (`timestamptz`) en la zona de la app. */
export function yearOfInstant(instant: string | Date, timeZone = APP_TIME_ZONE): number {
  const value = typeof instant === "string" ? new Date(instant) : instant;
  const year = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(value);
  return Number(year);
}

/** El año "actual" en la zona de la app. */
export function currentYear(now: Date = new Date(), timeZone = APP_TIME_ZONE): number {
  return yearOfInstant(now, timeZone);
}

// --- Histograma de puntuaciones ---------------------------------------------

/** 10 escalones de media estrella: ½, 1, 1½ … 5. El rating es 0-10, uno por escalón. */
export const RATING_STEPS = 10;

export interface RatedEntry {
  gameId: string;
  /** 0-10, en pasos de 1 (= media estrella). `null` = sin puntuar. */
  rating: number | null;
  playthroughNumber: number;
}

export interface RatingHistogram {
  /** `counts[i]` = juegos con `(i + 1) / 2` estrellas. Siempre 10 posiciones. */
  counts: number[];
  total: number;
  /** Promedio en estrellas (0-5), `null` sin puntuaciones. */
  averageStars: number | null;
}

/**
 * Último rating de cada juego, mismo criterio que la vista `game_scores`: una
 * rejugada reemplaza la puntuación anterior, no suma otra. Una rejugada sin
 * puntuar tampoco "borra" la anterior: cuenta la última **puntuada**.
 */
export function latestRatingByGame(entries: RatedEntry[]): Map<string, number> {
  const latest = new Map<string, { playthrough: number; rating: number }>();
  for (const entry of entries) {
    if (entry.rating === null || entry.rating <= 0) continue;
    const current = latest.get(entry.gameId);
    if (!current || entry.playthroughNumber > current.playthrough) {
      latest.set(entry.gameId, { playthrough: entry.playthroughNumber, rating: entry.rating });
    }
  }
  return new Map(Array.from(latest, ([gameId, value]) => [gameId, value.rating]));
}

/**
 * Las entradas que cuenta la barra `step` del histograma: por cada juego, la
 * que tiene su último rating, si cae en ese escalón. Es el filtro de
 * `/perfil/resenas?rating=N`, y usa el mismo criterio que el histograma para
 * que el número de la barra y la lista coincidan.
 */
export function entriesForRatingStep<T extends RatedEntry>(entries: T[], step: number): T[] {
  const latest = new Map<string, T>();
  for (const entry of entries) {
    if (entry.rating === null || entry.rating <= 0) continue;
    const current = latest.get(entry.gameId);
    if (!current || entry.playthroughNumber > current.playthroughNumber) {
      latest.set(entry.gameId, entry);
    }
  }
  return entries.filter(
    (entry) => latest.get(entry.gameId) === entry && ratingStep(entry.rating!) === step,
  );
}

/** Escalón (1-10) de un rating 0-10. Los decimales se redondean al más cercano. */
export function ratingStep(rating: number): number {
  return Math.min(RATING_STEPS, Math.max(1, Math.round(rating)));
}

export function ratingHistogram(entries: RatedEntry[]): RatingHistogram {
  const counts = Array.from({ length: RATING_STEPS }, () => 0);
  let sum = 0;
  const latest = latestRatingByGame(entries);
  for (const rating of latest.values()) {
    counts[ratingStep(rating) - 1] += 1;
    sum += rating;
  }
  const total = latest.size;
  return { counts, total, averageStars: total === 0 ? null : sum / total / 2 };
}

/** "½", "1", "1½" … "5" para el escalón 1-10. */
export function starsLabel(step: number): string {
  const whole = Math.floor(step / 2);
  const half = step % 2 === 1;
  if (whole === 0) return "½";
  return half ? `${whole}½` : String(whole);
}

// --- Juegos jugados ----------------------------------------------------------

/**
 * Un hecho que hace que un juego cuente como "jugado" (definición del epic
 * #183): platino de PSN, 100% de Steam o una entrada en el diario.
 */
export interface PlayedEvent {
  gameId: string;
  /** Año en que pasó, ya resuelto (`yearOfDate` o `yearOfInstant`). `null` = sin fecha. */
  year: number | null;
}

export interface PlayedSummary {
  /** Juegos distintos, en el orden en que aparecieron por primera vez. */
  gameIds: string[];
  total: number;
  thisYear: number;
}

/**
 * Une los tres orígenes sin contar dos veces un juego: uno platinado **y**
 * reseñado es un solo juego jugado. Cuenta "este año" si **cualquiera** de sus
 * hechos cayó en el año (reseñar este año un juego platinado en 2023 es
 * haberlo jugado este año).
 */
export function summarizePlayed(events: PlayedEvent[], year: number): PlayedSummary {
  const seen = new Map<string, boolean>();
  for (const event of events) {
    const inYear = event.year === year;
    seen.set(event.gameId, (seen.get(event.gameId) ?? false) || inYear);
  }
  let thisYear = 0;
  for (const inYear of seen.values()) if (inYear) thisYear += 1;
  return { gameIds: Array.from(seen.keys()), total: seen.size, thisYear };
}

/** Total y "este año" de una lista de años (una fila por hecho, ya sin duplicados). */
export function countWithYear(
  years: (number | null)[],
  year: number,
): {
  total: number;
  thisYear: number;
} {
  return { total: years.length, thisYear: years.filter((y) => y === year).length };
}
