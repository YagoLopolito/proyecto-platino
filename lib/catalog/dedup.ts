import "server-only";
import type { CatalogSearchResult } from "@/lib/covers";
// `normalizeName` vive en un módulo sin `server-only` para poder testearla;
// se re-exporta acá porque varios módulos ya la importaban de este archivo.
import { normalizeName } from "./normalize";

export { normalizeName };

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
