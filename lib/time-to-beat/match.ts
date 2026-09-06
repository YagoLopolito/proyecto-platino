/**
 * Helpers puros del módulo de tiempos estimados: elegir cuál de los candidatos
 * que devuelve IGDB es realmente el juego que estamos mirando, y pasar sus
 * segundos a minutos.
 *
 * Sin `import "server-only"` a propósito (no toca red ni secretos): corre en
 * el server igual, pero así se testea directo desde un spec, misma razón que
 * `lib/catalog/normalize.ts` y `lib/diary/screenshot-import.ts`.
 */
import { normalizeName } from "@/lib/catalog/normalize";

export interface IgdbGameCandidate {
  id: number;
  name: string;
}

/**
 * IGDB responde a una búsqueda por texto con todo lo que se parezca: DLCs,
 * ediciones, packs y hasta bandas de sonido. Se elige el que matchea exacto
 * por `normalizeName` (que ya saca "Remastered", "Director's Cut", etc.) y, si
 * ninguno matchea, **nada**: es preferible no mostrar tiempos a mostrar los de
 * otro juego.
 */
export function pickIgdbGame(
  wantedName: string,
  candidates: readonly IgdbGameCandidate[],
): IgdbGameCandidate | null {
  const wanted = normalizeName(wantedName);
  if (!wanted) return null;

  for (const candidate of candidates) {
    if (normalizeName(candidate.name) === wanted) return candidate;
  }
  return null;
}

/**
 * IGDB devuelve los tiempos en segundos. Se redondea a minutos porque es la
 * unidad de la columna (la misma que `user_games.playtime_minutes`).
 *
 * Devuelve `null` para 0, negativos y valores no numéricos: en IGDB un tiempo
 * sin datos viene como 0, y mostrarlo como "0 h" sería mentir.
 */
export function secondsToMinutes(seconds: unknown): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds / 60);
}

/** Horas (RAWG las publica así) a minutos, con el mismo criterio. */
export function hoursToMinutes(hours: unknown): number | null {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) return null;
  return Math.round(hours * 60);
}
