/**
 * Órdenes de la grilla de un estudio (`?orden=`). Puro, sin `server-only`:
 * lo usa la página y se testea desde el spec.
 */
export type StudioGameOrder = "anio" | "puntuados" | "nombre";

export const STUDIO_GAME_ORDERS: { value: StudioGameOrder; label: string }[] = [
  { value: "anio", label: "Año" },
  { value: "puntuados", label: "Mejor puntuados" },
  { value: "nombre", label: "Nombre" },
];

export function parseStudioGameOrder(raw: string | undefined): StudioGameOrder {
  return raw === "puntuados" || raw === "nombre" ? raw : "anio";
}

export interface SortableStudioGame {
  name: string;
  year: number | null;
  /** Promedio de Platinoob; `null` = sin puntuaciones (o el juego no está en `games`). */
  score: number | null;
}

/**
 * Lo que no tiene el dato (sin año, sin puntuación) va siempre al final,
 * misma regla que la Playlist. El desempate es por nombre.
 */
export function sortStudioGames<T extends SortableStudioGame>(games: T[], order: StudioGameOrder): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "es");
  const desc = (key: "year" | "score") => (a: T, b: T) => {
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return byName(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || byName(a, b);
  };
  const compare = order === "nombre" ? byName : desc(order === "anio" ? "year" : "score");
  return [...games].sort(compare);
}
