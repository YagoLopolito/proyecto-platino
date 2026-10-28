/**
 * Cuentas de la colección de platinos (vitrina, ficha del juego, celebración).
 * Puro y sin `server-only`: se testea desde el spec y lo usan componentes
 * cliente.
 */
import { APP_TIME_ZONE, yearOfInstant } from "@/lib/profile/stats";

/** Un platino de la colección, tal como sale de `get_platinum_collection()`. */
export interface PlatinumPiece {
  userTrophyId: string;
  gameId: string;
  name: string;
  imageUrl: string | null;
  unlockedAt: string;
  /** % de jugadores de PSN que lo tienen. NULL = PSN no lo informó. */
  earnedRate: number | null;
  /** El primer trofeo de ese juego (para "cuánto tardaste"). */
  firstUnlockedAt: string | null;
  /** Número en la colección: el primero es el #1. */
  number: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Días entre el primer trofeo del juego y el platino. NULL si falta el dato. */
export function daysToPlatinum(firstUnlockedAt: string | null, unlockedAt: string): number | null {
  if (!firstUnlockedAt) return null;
  const first = Date.parse(firstUnlockedAt);
  const platinum = Date.parse(unlockedAt);
  if (Number.isNaN(first) || Number.isNaN(platinum)) return null;
  return Math.max(0, Math.floor((platinum - first) / MS_PER_DAY));
}

export function formatDaysToPlatinum(days: number): string {
  if (days === 0) return "en el mismo día";
  if (days === 1) return "en 1 día";
  return `en ${days.toLocaleString("es-AR")} días`;
}

/** "3,2%"; por debajo de 1%, con un decimal más ("0,45%"). */
export function formatEarnedRate(rate: number): string {
  return `${rate.toLocaleString("es-AR", { maximumFractionDigits: rate < 1 ? 2 : 1 })}%`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

/**
 * "12/03/2026" en la zona de la app: un platino de la noche del 31/12 en
 * Buenos Aires es del 31/12, aunque en UTC (Vercel) ya sea enero.
 */
export function formatPlatinumDate(instant: string): string {
  return DATE_FORMAT.format(new Date(instant));
}

export interface ShowcaseStats {
  total: number;
  rarest: PlatinumPiece | null;
  fastest: (PlatinumPiece & { days: number }) | null;
  bestYear: { year: number; count: number } | null;
}

export function showcaseStats(pieces: PlatinumPiece[]): ShowcaseStats {
  let rarest: PlatinumPiece | null = null;
  let fastest: (PlatinumPiece & { days: number }) | null = null;
  const byYear = new Map<number, number>();

  for (const piece of pieces) {
    if (piece.earnedRate !== null && (rarest === null || piece.earnedRate < rarest.earnedRate!)) {
      rarest = piece;
    }
    const days = daysToPlatinum(piece.firstUnlockedAt, piece.unlockedAt);
    if (days !== null && (fastest === null || days < fastest.days)) {
      fastest = { ...piece, days };
    }
    const year = yearOfInstant(piece.unlockedAt);
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }

  // Empate de años: gana el más reciente.
  let bestYear: ShowcaseStats["bestYear"] = null;
  for (const [year, count] of byYear) {
    if (!bestYear || count > bestYear.count || (count === bestYear.count && year > bestYear.year)) {
      bestYear = { year, count };
    }
  }

  return { total: pieces.length, rarest, fastest, bestYear };
}

export const SHOWCASE_ORDERS = ["antiguos", "recientes", "rareza"] as const;
export type ShowcaseOrder = (typeof SHOWCASE_ORDERS)[number];

export function parseShowcaseOrder(raw: string | undefined): ShowcaseOrder {
  return SHOWCASE_ORDERS.includes(raw as ShowcaseOrder) ? (raw as ShowcaseOrder) : "antiguos";
}

/**
 * Orden de la vitrina. Por rareza, el más raro primero; los que no tienen el
 * dato van al final, en el orden de la colección.
 */
export function sortPieces(pieces: PlatinumPiece[], order: ShowcaseOrder): PlatinumPiece[] {
  const byNumber = [...pieces].sort((a, b) => a.number - b.number);
  if (order === "recientes") return byNumber.reverse();
  if (order === "rareza") {
    return byNumber.sort((a, b) => {
      if (a.earnedRate === null && b.earnedRate === null) return 0;
      if (a.earnedRate === null) return 1;
      if (b.earnedRate === null) return -1;
      return a.earnedRate - b.earnedRate;
    });
  }
  return byNumber;
}

/** El trofeo obtenido más raro de un juego (el de menor `earned_rate`). */
export function rarestObtained<T extends { obtained: boolean; earned_rate: number | null }>(
  trophies: T[],
): T | null {
  let rarest: T | null = null;
  for (const trophy of trophies) {
    if (!trophy.obtained || trophy.earned_rate === null) continue;
    if (rarest === null || trophy.earned_rate < rarest.earned_rate!) rarest = trophy;
  }
  return rarest;
}
