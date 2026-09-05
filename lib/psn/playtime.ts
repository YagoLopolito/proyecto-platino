import "server-only";
import { getUserPlayedGames, type AuthorizationPayload } from "psn-api";
import {
  collectPlaytimePages,
  type PlaytimePageFetcher,
  type PsnPlaytimeResult,
} from "./playtime-pages";

/**
 * Horas jugadas en PSN.
 *
 * Sony las expone en `getUserPlayedGames` (la lista de "juegos jugados" de la
 * PS App), que está indexada por `titleId` (`CUSA…`/`PPSA…`), mientras que todo
 * el sync de trofeos gira alrededor del `npCommunicationId` (`NPWR…`). No hay
 * mapeo oficial entre las dos claves, así que el cruce es por nombre
 * normalizado -- el mismo criterio (y las mismas limitaciones con remasters y
 * ediciones) que `adoptCatalogGame` en `sync.ts`.
 *
 * Es un dato secundario: si esta llamada falla, el sync de trofeos sigue.
 *
 * Este archivo es sólo el wiring con `psn-api`; el recorrido de páginas vive en
 * `playtime-pages.ts`, sin `server-only`, para poder testearlo.
 */
const PAGE_LIMIT = 100;

/**
 * Categorías pedidas explícitamente: el default del endpoint deja afuera
 * títulos que sí están en la lista de trofeos (PS3/Vita/PC vía "unknown" y
 * "pspc_game"), y sin ellas la mayoría de la biblioteca quedaba sin horas.
 */
const CATEGORIES = "ps4_game,ps5_native_game,pspc_game,unknown";

export { parsePlayDurationMinutes, playtimeMatchKey } from "./playtime-pages";
export type { PsnPlaytimeResult, PlaytimePageFetcher } from "./playtime-pages";

export async function fetchPsnPlaytime(
  authorization: AuthorizationPayload,
  accountId: string,
): Promise<PsnPlaytimeResult> {
  const fetchPage: PlaytimePageFetcher = (offset) =>
    getUserPlayedGames(authorization, accountId, {
      limit: PAGE_LIMIT,
      offset,
      categories: CATEGORIES,
    });
  return collectPlaytimePages(fetchPage);
}
