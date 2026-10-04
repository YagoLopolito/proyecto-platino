/**
 * Orden del carrusel en el compositor y del selector de juegos. Módulo puro.
 */

/** Mueve el ítem `from` a la posición `to` (devuelve un array nuevo). Fuera de rango: sin cambios. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Saca el ítem `index` (devuelve un array nuevo). */
export function removeItem<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

export interface PickableGame {
  id: string;
  name: string;
}

/**
 * Lo que estás jugando va primero, en el orden en que lo empezaste a jugar
 * (como viene de `now_playing`), y después el resto por nombre. Sin
 * duplicados: un juego que está en las dos listas aparece sólo arriba.
 */
export function sortGamesPlayingFirst<T extends PickableGame>(
  playing: readonly T[],
  others: readonly T[],
): T[] {
  const seen = new Set(playing.map((game) => game.id));
  const rest = others
    .filter((game) => !seen.has(game.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  return [...playing, ...rest];
}
