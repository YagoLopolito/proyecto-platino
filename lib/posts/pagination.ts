/**
 * Paginación numerada de la Galería online (`?page=N`). Módulo puro.
 *
 * Es offset y no cursor (como Biblioteca › Reseñas) porque la página tiene que
 * poder linkearse y recargarse por número: el costo conocido es que si alguien
 * publica mientras navegás, el último post de una página puede repetirse
 * arriba de la siguiente.
 */

/** Total de páginas; 1 aunque no haya nada (la página 1 vacía muestra el estado vacío). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/**
 * La página pedida en la URL, saneada: cualquier cosa que no sea un entero
 * positivo es la 1. NO se recorta contra el total acá: eso lo decide la página
 * (que redirige a la última si te pasaste).
 */
export function parsePageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{1,6}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 ? page : 1;
}

/** Rango `from..to` (inclusive) para el `.range()` de PostgREST. */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export type PageItem = { type: "page"; page: number } | { type: "ellipsis"; key: string };

/**
 * Los números a mostrar: siempre la primera y la última, la actual con
 * `siblings` vecinos de cada lado, y "…" donde se saltean páginas. Un "…" que
 * reemplazaría a un solo número se muestra como ese número (no ahorra lugar).
 *
 *   pageWindow(1, 1)   → [1]
 *   pageWindow(5, 10)  → [1, …, 4, 5, 6, …, 10]
 *   pageWindow(2, 10)  → [1, 2, 3, …, 10]
 */
export function pageWindow(current: number, total: number, siblings = 1): PageItem[] {
  const last = Math.max(1, total);
  const page = Math.min(Math.max(1, current), last);
  const start = Math.max(1, page - siblings);
  const end = Math.min(last, page + siblings);

  const pages = new Set<number>([1, last]);
  for (let p = start; p <= end; p++) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);

  const items: PageItem[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (p - previous === 2) items.push({ type: "page", page: p - 1 });
    else if (p - previous > 2) items.push({ type: "ellipsis", key: `gap-${previous}-${p}` });
    items.push({ type: "page", page: p });
    previous = p;
  }
  return items;
}

/** El href de una página: la 1 va sin `?page` (URL canónica). Conserva el resto de la query. */
export function pageHref(basePath: string, page: number, params?: Record<string, string>): string {
  const search = new URLSearchParams(params);
  if (page > 1) search.set("page", String(page));
  else search.delete("page");
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}
