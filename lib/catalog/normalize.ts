/**
 * Normalización de nombres de juego, aislada como módulo puro para poder
 * testearla e importarla desde specs (no lleva `import "server-only"`
 * justamente por eso: no toca red, base ni secretos, es manipulación de
 * strings). Misma razón por la que `lib/psn/pagination.ts` vive aparte.
 *
 * `lib/catalog/dedup.ts` la re-exporta para no romper a quien ya la importaba
 * de ahí.
 */
const EDITION_TOKENS = [
  "remastered",
  "remaster",
  "remake",
  "definitive edition",
  "goty edition",
  "game of the year edition",
  "director's cut",
  "directors cut",
  "hd",
  "complete edition",
];

/**
 * Nombre comparable entre fuentes distintas (RAWG, PSN, carga manual): sin
 * tokens de edición, sin puntuación y en minúsculas. Lo usa también el sync de
 * PSN para reconciliar un juego cargado antes desde el catálogo (issue #96).
 */
export function normalizeName(name: string): string {
  let normalized = name.toLowerCase().trim();
  for (const token of EDITION_TOKENS) {
    normalized = normalized.replaceAll(token, "");
  }
  return normalized.replace(/[^a-z0-9]+/g, " ").trim();
}
