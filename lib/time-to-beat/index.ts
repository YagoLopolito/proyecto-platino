import "server-only";
import { findIgdbTimeToBeat } from "./igdb";
import { TIME_TO_BEAT_MOCKS_ENABLED, mockTimeEstimates } from "./mocks";

export { pickIgdbGame, secondsToMinutes } from "./match";

/** De dónde salieron los tiempos; `none` = se consultó y no había nada. */
export type TimeEstimatesSource = "igdb" | "none";

export interface TimeEstimates {
  beatMinutes: number | null;
  completeMinutes: number | null;
  source: TimeEstimatesSource;
}

const EMPTY: TimeEstimates = { beatMinutes: null, completeMinutes: null, source: "none" };

/**
 * Tiempos estimados de un juego, al estilo HowLongToBeat. IGDB es la **única**
 * fuente.
 *
 * Se probó usar el `playtime` de RAWG como fallback y fue un error que hubo
 * que revertir: ese campo no es "cuánto lleva pasarlo" sino las horas que los
 * usuarios de RAWG declaran haber jugado, así que para un juego con pocos
 * registros devuelve 1 o 2. En la biblioteca real eso puso "1 h" en SILENT
 * HILL 2 y 8 h en RESIDENT EVIL 6. Un número creíble pero equivocado es peor
 * que ninguno: el usuario no tiene cómo saber que está mal.
 *
 * Nunca tira: sin credenciales, con la red caída o con una respuesta rara
 * devuelve `source: "none"`, y el caller lo guarda igual para no volver a
 * consultar en cada visita.
 */
export async function fetchTimeEstimates(gameName: string): Promise<TimeEstimates> {
  if (TIME_TO_BEAT_MOCKS_ENABLED) {
    const mocked = mockTimeEstimates(gameName);
    return mocked ? { ...mocked, source: "igdb" } : EMPTY;
  }

  const igdb = await findIgdbTimeToBeat(gameName);
  if (!igdb) return EMPTY;

  return { beatMinutes: igdb.beatMinutes, completeMinutes: igdb.completeMinutes, source: "igdb" };
}
