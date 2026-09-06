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

/**
 * `null` = **no se pudo consultar** (sin credenciales, red, 401, timeout). El
 * caller tiene que distinguirlo de un `TimeEstimates` con `source: "none"`:
 * ese se cachea ("IGDB no lo sabe, no vuelvas a preguntar") y este no, porque
 * si no un fallo transitorio deja el juego sin tiempos para siempre.
 */
export type TimeEstimatesOutcome = TimeEstimates | null;

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
 * Nunca tira. Devuelve `null` cuando no se pudo preguntar (sin credenciales,
 * red caída, 401): eso **no se cachea**, para que el juego se re-consulte solo
 * cuando el problema se arregle. Un `source: "none"` sí se cachea: significa
 * que IGDB contestó y no tiene el dato.
 */
export async function fetchTimeEstimates(gameName: string): Promise<TimeEstimatesOutcome> {
  if (TIME_TO_BEAT_MOCKS_ENABLED) {
    const mocked = mockTimeEstimates(gameName);
    if (mocked.status === "unavailable") return null;
    if (mocked.status === "not_found") return EMPTY;
    return {
      beatMinutes: mocked.beatMinutes,
      completeMinutes: mocked.completeMinutes,
      source: "igdb",
    };
  }

  const lookup = await findIgdbTimeToBeat(gameName);
  if (lookup.status === "unavailable") return null;
  if (lookup.status === "not_found") return EMPTY;

  return {
    beatMinutes: lookup.times.beatMinutes,
    completeMinutes: lookup.times.completeMinutes,
    source: "igdb",
  };
}
