import "server-only";
import { findIgdbTimeToBeat } from "./igdb";
import type { IgdbGameLookup } from "@/lib/igdb/games";
import { generateTimeEstimates } from "@/lib/ai";
import { TIME_TO_BEAT_MOCKS_ENABLED, mockTimeEstimates } from "./mocks";
import { findReferenceTimes } from "./reference";

export { pickIgdbGame, pickIgdbTimes, secondsToMinutes } from "./match";
export { findReferenceTimes } from "./reference";

/**
 * De dónde salieron los tiempos.
 * - `hltb`: la tabla de referencia de HowLongToBeat (`reference.ts`).
 * - `igdb`: agregados de la comunidad, para lo que la tabla no tiene.
 * - `ai`: estimación del modelo, para los juegos que IGDB no tiene.
 * - `none`: ninguna fuente lo conoce.
 */
export type TimeEstimatesSource = "hltb" | "igdb" | "ai" | "none";

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
 * Tiempos estimados de un juego, al estilo HowLongToBeat.
 *
 * Primero la tabla de HowLongToBeat (`reference.ts`), que es la referencia
 * contra la que el usuario compara; después IGDB (agregados reales de la
 * comunidad, pero de pocas partidas) y, para los juegos que ninguno tiene, una
 * estimación del modelo. La ficha siempre cita cuál fue: no son igual de
 * confiables, y el usuario tiene que poder distinguirlas.
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
export async function fetchTimeEstimates(
  gameName: string,
  context: {
    platform?: string | null;
    releaseYear?: number | null;
    /** El match con IGDB que ya hizo la ficha (se comparte con los estudios). */
    igdbGame?: IgdbGameLookup;
  } = {},
): Promise<TimeEstimatesOutcome> {
  const reference = findReferenceTimes(gameName);
  if (reference) return { ...reference, source: "hltb" };

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

  const lookup = await findIgdbTimeToBeat(gameName, context.igdbGame);
  if (lookup.status === "ok") {
    return {
      beatMinutes: lookup.times.beatMinutes,
      completeMinutes: lookup.times.completeMinutes,
      source: "igdb",
    };
  }

  // IGDB no lo tiene (o no se pudo consultar): se le pregunta al modelo, que
  // es lo único que hace que la ficha muestre un tiempo para los juegos que no
  // están en su catálogo. La UI lo marca como estimación de IA porque es
  // bastante menos confiable que un agregado de la comunidad.
  const estimated = await generateTimeEstimates({
    gameName,
    platform: context.platform ?? null,
    releaseYear: context.releaseYear ?? null,
  }).catch((cause) => {
    // Sin `AI_PROVIDER_API_KEY`, o con el rate limit de Groq agotado.
    console.error(`[time-to-beat] falló la estimación por IA de "${gameName}":`, cause);
    return null;
  });

  if (estimated) {
    return { ...estimated, source: "ai" };
  }

  // Si IGDB no se pudo consultar y la IA tampoco dio nada, no se cachea: el
  // problema puede ser transitorio y el juego tiene que reintentarse.
  return lookup.status === "unavailable" ? null : EMPTY;
}
