/**
 * "Cerca del platino" de Biblioteca › Juegos (epic #183, issue #191): los
 * juegos a los que les falta poco. Puro y sin `server-only`, para testearlo
 * directo desde el spec (igual que `lib/library/search.ts`).
 */

/** Más de este porcentaje (estricto) cuenta como "cerca". */
export const NEAR_PLATINUM_MIN_PERCENT = 80;

/** Tope de la fila: es un carrusel de "lo próximo", no otra biblioteca. */
export const NEAR_PLATINUM_LIMIT = 12;

export type NearPlatinumCandidate = {
  source: string | null;
  total: number;
  obtained: number;
  percent: number;
  /** Platinos obtenidos (0 o 1). Sólo tiene sentido en PSN. */
  platinumObtained: number;
};

/** Un juego está "cerca" (ver `selectNearPlatinum`). */
export function isNearPlatinum(game: NearPlatinumCandidate): boolean {
  if (game.total <= 0 || game.percent <= NEAR_PLATINUM_MIN_PERCENT) return false;
  if (game.obtained >= game.total) return false;
  return game.source === "steam" ? true : game.platinumObtained === 0;
}

/**
 * Juegos con más del 80% y todavía sin cerrar, del más avanzado al menos.
 *
 * "Sin cerrar" depende de la plataforma: en PSN es no tener el platino (un
 * juego puede estar al 95% con el platino ya ganado si le sumaron DLC, y ese
 * ya no está "cerca" de nada); en Steam, que no tiene platino, es no estar al
 * 100%, que es su equivalente en toda la app.
 */
export function selectNearPlatinum<T extends NearPlatinumCandidate>(
  games: T[],
  limit = NEAR_PLATINUM_LIMIT,
): T[] {
  return games
    .filter(isNearPlatinum)
    .sort((a, b) => b.percent - a.percent || b.obtained - a.obtained)
    .slice(0, limit);
}
