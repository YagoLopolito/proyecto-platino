/**
 * Órdenes de `/perfil/playlist` (epic #183, issue #188). Módulo puro, sin
 * `server-only`: lo usan la página (server) y el selector (client).
 *
 * El orden vive en `?orden=`, como el resto de los filtros de la app: es
 * linkeable y sobrevive al refresh.
 */
export const PLAYLIST_SORTS = ["recientes", "nombre", "anio", "tiempo"] as const;
export type PlaylistSort = (typeof PLAYLIST_SORTS)[number];

export const PLAYLIST_SORT_LABELS: Record<PlaylistSort, string> = {
  recientes: "Agregados recientemente",
  nombre: "Nombre",
  anio: "Año",
  tiempo: "Más cortos primero",
};

export function parsePlaylistSort(raw: string | undefined): PlaylistSort {
  return PLAYLIST_SORTS.includes(raw as PlaylistSort) ? (raw as PlaylistSort) : "recientes";
}

export interface SortablePlaylistGame {
  name: string;
  releaseYear: number | null;
  timeToBeatMinutes: number | null;
  addedAt: string;
}

/**
 * Ordena sin mutar. Lo que no tiene el dato (año o tiempo) va siempre al
 * final, en cualquier orden: un juego sin tiempo estimado no es "el más corto".
 * Los empates se desempatan por nombre, para que el orden no baile entre
 * visitas.
 */
export function sortPlaylist<T extends SortablePlaylistGame>(games: T[], sort: PlaylistSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "es");
  const nullsLast = (a: number | null, b: number | null, direction: 1 | -1) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return (a - b) * direction;
  };

  return [...games].sort((a, b) => {
    switch (sort) {
      case "nombre":
        return byName(a, b);
      case "anio":
        return nullsLast(a.releaseYear, b.releaseYear, -1) || byName(a, b);
      case "tiempo":
        return nullsLast(a.timeToBeatMinutes, b.timeToBeatMinutes, 1) || byName(a, b);
      case "recientes":
      default:
        return b.addedAt.localeCompare(a.addedAt) || byName(a, b);
    }
  });
}
