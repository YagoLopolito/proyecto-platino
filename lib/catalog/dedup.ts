import "server-only";
import type { CatalogSearchResult } from "@/lib/covers";

export interface ExistingGame {
  id: string;
  name: string;
  cover_url: string | null;
}

export interface CombinedSearchResult {
  source: "library" | "catalog";
  gameId?: string;
  externalId?: string;
  name: string;
  coverUrl: string | null;
  releaseYear?: number | null;
  platform?: string | null;
  possibleDuplicateOf?: { gameId: string; name: string } | null;
}

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

/**
 * Combina resultados de RAWG con juegos ya existentes en `games`: descarta los
 * que matchean exacto (ya están en `libraryResults`) y marca como posible
 * duplicado (remaster/remake) a los que matchean después de sacar tokens de
 * edición. Heurística simple por diseño -- issue #90 la deja explícitamente
 * como no bloqueante para refinar después.
 */
export function dedupeAndFlag(
  catalogResults: CatalogSearchResult[],
  existingGames: ExistingGame[],
): CombinedSearchResult[] {
  const existingByNormalizedName = new Map(
    existingGames.map((game) => [normalizeName(game.name), game] as const),
  );

  const out: CombinedSearchResult[] = [];
  for (const result of catalogResults) {
    const normalized = normalizeName(result.name);
    const exactMatch = existingGames.find(
      (game) => game.name.toLowerCase().trim() === result.name.toLowerCase().trim(),
    );
    if (exactMatch) continue; // ya está ofrecido como resultado "library"

    const editionMatch = existingByNormalizedName.get(normalized);
    out.push({
      source: "catalog",
      externalId: result.externalId,
      name: result.name,
      coverUrl: result.coverUrl,
      releaseYear: result.releaseYear,
      possibleDuplicateOf: editionMatch
        ? { gameId: editionMatch.id, name: editionMatch.name }
        : null,
    });
  }
  return out;
}
