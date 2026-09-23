/**
 * Puente entre el advisor con IA y la lista de trofeos.
 *
 * Desde la ficha unificada (epic #183, issue #186) viven en tabs distintas:
 * el advisor en "Guías e IA" y la lista en "Trofeos". Ya no alcanza con un
 * evento del DOM entre dos componentes montados a la vez, así que el pedido de
 * foco viaja en la URL: el chip del advisor linkea a la tab de trofeos con
 * `?trofeo=<id>`, y `TrophyList` lo lee, limpia sus filtros -- si no, el trofeo
 * podría estar oculto y no habría a dónde scrollear -- y marca el trofeo como
 * enfocado. De paso, "este trofeo en esta ficha" pasa a ser un link que se
 * puede compartir.
 */
export const FOCUS_TROPHY_PARAM = "trofeo";

export function trophyFocusHref(gameId: string, trophyId: string): string {
  return `/juegos/${gameId}/trofeos?${FOCUS_TROPHY_PARAM}=${encodeURIComponent(trophyId)}`;
}
