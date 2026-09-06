import "server-only";
import { findIgdbTimeToBeat } from "./igdb";
import { hoursToMinutes } from "./match";
import { TIME_TO_BEAT_MOCKS_ENABLED, mockTimeEstimates } from "./mocks";

export { pickIgdbGame, secondsToMinutes, hoursToMinutes } from "./match";

/** De dónde salieron los tiempos; `none` = se consultó y no había nada. */
export type TimeEstimatesSource = "igdb" | "rawg" | "none";

export interface TimeEstimates {
  beatMinutes: number | null;
  completeMinutes: number | null;
  source: TimeEstimatesSource;
}

const EMPTY: TimeEstimates = { beatMinutes: null, completeMinutes: null, source: "none" };

/**
 * Tiempos estimados de un juego, al estilo HowLongToBeat.
 *
 * IGDB es la única fuente con los dos números (historia y 100%). RAWG queda
 * como último recurso y **sólo aporta el de historia** (`playtime` es un
 * promedio de horas hasta terminarlo; no publica nada del 100%), así que un
 * juego que caiga en ese camino muestra una sola cifra. Se prefiere eso a no
 * mostrar nada: la mayoría de las fichas ya consultan RAWG por la descripción,
 * o sea que ese dato ya viene en la misma respuesta, gratis.
 *
 * Nunca tira: sin credenciales, con la red caída o con una respuesta rara
 * devuelve `source: "none"`, y el caller lo guarda igual para no volver a
 * consultar en cada visita.
 */
export async function fetchTimeEstimates(
  gameName: string,
  rawgPlaytimeHours?: number | null,
): Promise<TimeEstimates> {
  if (TIME_TO_BEAT_MOCKS_ENABLED) {
    const mocked = mockTimeEstimates(gameName);
    return mocked ? { ...mocked, source: "igdb" } : EMPTY;
  }

  const igdb = await findIgdbTimeToBeat(gameName);
  if (igdb) {
    return { beatMinutes: igdb.beatMinutes, completeMinutes: igdb.completeMinutes, source: "igdb" };
  }

  const fromRawg = hoursToMinutes(rawgPlaytimeHours);
  if (fromRawg !== null) {
    return { beatMinutes: fromRawg, completeMinutes: null, source: "rawg" };
  }

  return EMPTY;
}
