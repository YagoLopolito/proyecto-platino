/**
 * Puente entre el advisor con IA y la lista de trofeos de la misma página.
 *
 * Los dos son Client Components hermanos (los monta `page.tsx`, un Server
 * Component, así que no pueden compartir estado por props ni por un provider
 * sin volver cliente a la página entera). Un evento del DOM alcanza: el chip
 * del advisor lo dispara y `TrophyList` lo escucha, limpia sus filtros -- si
 * no, el trofeo podría estar oculto y no habría a dónde scrollear -- y marca
 * el trofeo como enfocado.
 */
export const FOCUS_TROPHY_EVENT = "platino:focus-trophy";

export type FocusTrophyDetail = { trophyId: string };

export function focusTrophy(trophyId: string) {
  window.dispatchEvent(
    new CustomEvent<FocusTrophyDetail>(FOCUS_TROPHY_EVENT, { detail: { trophyId } }),
  );
}
