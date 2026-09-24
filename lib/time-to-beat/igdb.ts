import "server-only";
import { igdbQuery } from "@/lib/igdb/client";
import { resolveIgdbGame, type IgdbGameLookup } from "@/lib/igdb/games";
import { secondsToMinutes } from "./match";

/**
 * Tiempos de IGDB, la única fuente que publica los dos que pide la ficha:
 * historia principal y 100%.
 *
 * **Por qué IGDB y no HowLongToBeat**: HLTB no tiene API pública. Lo que se
 * usa por ahí es su endpoint interno de búsqueda, que exige un hash extraído
 * del bundle JS del sitio y cambia en cada release -- el mismo problema que el
 * GraphQL de la PS App, más un ToS que no permite scrapearlo. IGDB es de
 * Twitch/Amazon, tiene API oficial documentada, es gratis y su
 * `game_time_to_beat` es exactamente el dato ("hastily" / "normally" /
 * "completely", agregados de la comunidad).
 *
 * El cliente HTTP y el match por nombre viven en `lib/igdb/` desde el issue
 * #193: los comparten con los estudios.
 */

export interface IgdbTimeToBeat {
  /** Minutos de la historia principal ("normally" en IGDB). */
  beatMinutes: number | null;
  /** Minutos para el 100% ("completely"). */
  completeMinutes: number | null;
}

/**
 * Resultado de consultar IGDB. Distinguir "no pudimos preguntar" de "IGDB no
 * lo sabe" **no es cosmético**: el caller marca el juego como consultado para
 * no volver a pedirlo nunca más, y hacer eso ante un fallo de credenciales o
 * de red quema el juego para siempre. Pasó de verdad: 13 juegos quedaron en
 * `none` porque las credenciales todavía no estaban cargadas.
 */
export type IgdbLookup =
  | { status: "ok"; times: IgdbTimeToBeat }
  /** IGDB contestó bien y no tiene tiempos para ese juego. */
  | { status: "not_found" }
  /** No se pudo preguntar (sin credenciales, red, 401, timeout). No cachear. */
  | { status: "unavailable"; reason: string };

/**
 * Tiempos estimados de un juego. `resolved` es el match ya hecho por la ficha
 * (`resolveIgdbGame`), para no buscar el mismo nombre dos veces; sin él, se
 * resuelve acá.
 *
 * Loguea con prefijo `[igdb]` cada camino que no termina en datos. Sin eso, un
 * fallo de credenciales y un juego que IGDB no conoce se veían exactamente
 * igual desde afuera (la ficha sin la sección).
 */
export async function findIgdbTimeToBeat(
  gameName: string,
  resolved?: IgdbGameLookup,
): Promise<IgdbLookup> {
  try {
    const game = resolved ?? (await resolveIgdbGame(gameName));
    if (game.status !== "ok") return game;

    const times = await igdbQuery(
      "game_time_to_beat",
      `fields normally,completely; where game_id = ${game.id}; limit 1;`,
    );
    if ("error" in times) {
      console.error(`[igdb] no se pudieron pedir los tiempos de "${gameName}": ${times.error}`);
      return { status: "unavailable", reason: times.error };
    }
    if (times.rows.length === 0) {
      console.warn(`[igdb] "${gameName}" (id ${game.id}) no tiene tiempos cargados en IGDB`);
      return { status: "not_found" };
    }

    const first = times.rows[0];
    if (typeof first !== "object" || first === null) return { status: "not_found" };
    const { normally, completely } = first as Record<string, unknown>;

    const beatMinutes = secondsToMinutes(normally);
    const completeMinutes = secondsToMinutes(completely);
    if (beatMinutes === null && completeMinutes === null) return { status: "not_found" };

    return { status: "ok", times: { beatMinutes, completeMinutes } };
  } catch (cause) {
    // Timeout del AbortSignal, DNS, TLS: no pudimos preguntar, no es que IGDB
    // no sepa. No se cachea.
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`[igdb] falló la consulta de "${gameName}": ${reason}`);
    return { status: "unavailable", reason };
  }
}
