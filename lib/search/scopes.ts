/**
 * Ámbitos de la búsqueda (epic #183, issue #194). Puro, sin `server-only`: lo
 * usan la pantalla, el header y la Server Action.
 *
 * `todo` es lo que se busca desde el header de escritorio, sin elegir ámbito;
 * en `/buscar` abre la tab Juegos.
 */
export const SEARCH_SCOPES = ["todo", "juegos", "estudios", "listas", "usuarios"] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

/** Los que tienen tab propia en `/buscar`, en orden. */
export const SEARCH_TABS = ["juegos", "estudios", "listas", "usuarios"] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];

export const SCOPE_LABELS: Record<SearchScope, string> = {
  todo: "Todo",
  juegos: "Juegos",
  estudios: "Estudios",
  listas: "Listas",
  usuarios: "Usuarios",
};

export interface RecentSearch {
  id: string;
  query: string;
  scope: SearchScope;
}

/** Tope de búsquedas recientes por usuario. */
export const MAX_RECENT_SEARCHES = 20;
/** Largo máximo de una búsqueda (mismo `check` que la tabla). */
export const MAX_QUERY_LENGTH = 100;

export function parseSearchScope(raw: string | null | undefined): SearchScope {
  return SEARCH_SCOPES.includes(raw as SearchScope) ? (raw as SearchScope) : "todo";
}

/** La tab que abre un ámbito: `todo` cae en Juegos. */
export function tabOfScope(scope: SearchScope): SearchTab {
  return scope === "todo" ? "juegos" : scope;
}

/** `/buscar?q=…&en=…`. Sin `en` para `todo`, así el link del header queda corto. */
export function searchHref(query: string, scope: SearchScope): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (scope !== "todo") params.set("en", scope);
  const qs = params.toString();
  return qs ? `/buscar?${qs}` : "/buscar";
}

/**
 * `/buscar/ir`: guarda la búsqueda en recientes y redirige a `to` (o a los
 * resultados si no hay `to`). Es un link común, así guardar al abrir un
 * resultado no depende de JS ni de que una Server Action llegue a terminar
 * antes de la navegación.
 */
export function saveAndGoHref(query: string, scope: SearchScope, to?: string): string {
  const params = new URLSearchParams({ q: query, en: scope });
  if (to) params.set("to", to);
  return `/buscar/ir?${params.toString()}`;
}

/** Sólo rutas internas: un `to` como `//evil.com` o `https://…` es un open redirect. */
export function safeInternalPath(to: string | null): string | null {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) return null;
  return to;
}
