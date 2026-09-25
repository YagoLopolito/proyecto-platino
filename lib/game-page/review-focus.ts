/**
 * "Leer más" del feed de Biblioteca › Reseñas (epic #183, issue #191): abre la
 * ficha del juego en su tab Reseñas (`/juegos/[id]/resenas`) con esa reseña enfocada.
 *
 * Puro y sin `server-only`: lo usan el feed (cliente) y la tab (server). El
 * foco viaja en la URL, igual que el de un trofeo (`focusTrophy.ts`): el
 * `?resena=` marca la fila y el `#` hace que el navegador la lleve a la vista
 * sin JS.
 */
export const FOCUS_REVIEW_PARAM = "resena";

export function reviewAnchorId(entryId: string): string {
  return `resena-${entryId}`;
}

export function reviewFocusHref(gameId: string, entryId: string): string {
  return `/juegos/${gameId}/resenas?${FOCUS_REVIEW_PARAM}=${entryId}#${reviewAnchorId(entryId)}`;
}
