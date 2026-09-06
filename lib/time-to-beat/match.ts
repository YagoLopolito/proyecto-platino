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
 * Sufijos que trae el catálogo de PSN/Steam y que IGDB no usa en el título del
 * juego. Sin sacarlos, "Call of Duty: Black Ops II - Multiplayer" no matchea
 * nunca contra "Call of Duty: Black Ops II".
 */
const NOISE_SUFFIXES = [
  "multiplayer",
  "single player",
  "singleplayer",
  "campaign",
  "campana",
  "zombies",
  "ps4",
  "ps5",
  "playstation 4",
  "playstation 5",
  "bundle",
  "trial",
  "demo",
  "beta",
];

/** Nombre comparable: sin tokens de edición (`normalizeName`) ni sufijos de tienda. */
export function comparableName(name: string): string {
  let normalized = normalizeName(name);
  for (const suffix of NOISE_SUFFIXES) {
    if (normalized.endsWith(` ${suffix}`)) {
      normalized = normalized.slice(0, -suffix.length - 1).trim();
    }
  }
  return normalized;
}

/**
 * Cuán parecidos son dos nombres ya normalizados, de 0 a 1: proporción de
 * palabras del más corto que aparecen en el más largo, penalizada por la
 * diferencia de longitud.
 *
 * Es deliberadamente simple (no es distancia de edición): lo que hay que
 * distinguir son títulos que comparten palabras, no erratas.
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const wordsA = a.split(" ").filter(Boolean);
  const wordsB = b.split(" ").filter(Boolean);
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];

  const longerSet = new Set(longer);
  const shared = shorter.filter((word) => longerSet.has(word)).length;
  const coverage = shared / shorter.length;

  // Penaliza que el candidato tenga muchas palabras de más: "God of War" cubre
  // el 100% de "God of War Ragnarök: Valhalla", y no son el mismo juego.
  const lengthRatio = shorter.length / longer.length;
  return coverage * (0.5 + 0.5 * lengthRatio);
}

/** Debajo de esto no se considera el mismo juego. Calibrado con la biblioteca real. */
export const MIN_NAME_SIMILARITY = 0.72;

/**
 * Elige el juego de IGDB que corresponde al nombre buscado.
 *
 * Antes esto exigía igualdad exacta y descartaba demasiado: los nombres de PSN
 * traen ®/™, sufijos de tienda ("- Multiplayer") o son más cortos que el
 * título real ("Skyrim" contra "The Elder Scrolls V: Skyrim"). Ahora hay dos
 * pasadas: primero el match exacto (que sigue ganando siempre que exista) y,
 * si no hay, el candidato más parecido por encima de `MIN_NAME_SIMILARITY`.
 *
 * El umbral existe para no caer en el problema opuesto: mostrar el tiempo de
 * otro juego es peor que no mostrar ninguno.
 */
export function pickIgdbGame<T extends IgdbGameCandidate>(
  wantedName: string,
  candidates: readonly T[],
): T | null {
  const wanted = comparableName(wantedName);
  if (!wanted) return null;

  for (const candidate of candidates) {
    if (comparableName(candidate.name) === wanted) return candidate;
  }

  // El catálogo de PSN a veces guarda el nombre corto ("Skyrim") y el título
  // real de IGDB le agrega un prefijo ("The Elder Scrolls V: Skyrim"). Eso es
  // el mismo juego. Al revés no: cuando el candidato agrega un SUFIJO
  // ("God of War" -> "God of War Ragnarök"), es otra entrega o un DLC.
  for (const candidate of candidates) {
    if (comparableName(candidate.name).endsWith(` ${wanted}`)) return candidate;
  }

  let best: T | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const candidateName = comparableName(candidate.name);
    // Un candidato que sólo agrega palabras al final del nombre buscado es
    // otra entrega de la saga, por más que comparta todas las palabras.
    if (candidateName.startsWith(`${wanted} `)) continue;
    const score = nameSimilarity(wanted, candidateName);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= MIN_NAME_SIMILARITY ? best : null;
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
