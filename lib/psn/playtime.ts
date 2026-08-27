import "server-only";
import { getUserPlayedGames, type AuthorizationPayload } from "psn-api";
import { normalizeName } from "@/lib/catalog/dedup";

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
 */
const PAGE_LIMIT = 100;

/** Tope de páginas, por si la paginación de PSN devolviera algo inesperado. */
const MAX_PAGES = 30;

/**
 * Categorías pedidas explícitamente: el default del endpoint deja afuera
 * títulos que sí están en la lista de trofeos (PS3/Vita/PC vía "unknown" y
 * "pspc_game"), y sin ellas la mayoría de la biblioteca quedaba sin horas.
 */
const CATEGORIES = "ps4_game,ps5_native_game,pspc_game,unknown";

/**
 * `playDuration` viene como duración ISO 8601 con precisión de 1 segundo
 * (ej. "PT228H56M33S"). Los segundos se descartan: la columna guarda minutos.
 */
export function parsePlayDurationMinutes(playDuration: string | null | undefined): number | null {
  if (!playDuration) return null;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(playDuration);
  if (!match) return null;

  const [, days, hours, minutes] = match;
  const total = Number(days ?? 0) * 24 * 60 + Number(hours ?? 0) * 60 + Number(minutes ?? 0);
  return Number.isFinite(total) ? Math.round(total) : null;
}

export type PsnPlaytimeResult = {
  /** Minutos jugados por nombre de juego normalizado, para cruzar con los títulos de trofeos. */
  byName: Map<string, number>;
  /** Cuántos títulos devolvió PSN en total (para el log de resumen del sync). */
  titlesFetched: number;
};

export async function fetchPsnPlaytime(
  authorization: AuthorizationPayload,
  accountId: string,
): Promise<PsnPlaytimeResult> {
  const byName = new Map<string, number>();
  let offset = 0;
  let titlesFetched = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await getUserPlayedGames(authorization, accountId, {
      limit: PAGE_LIMIT,
      offset,
      categories: CATEGORIES,
    });
    const titles = response.titles ?? [];
    titlesFetched += titles.length;

    for (const title of titles) {
      const minutes = parsePlayDurationMinutes(title.playDuration);
      if (minutes === null || minutes <= 0) continue;
      const key = normalizeName(title.name ?? title.localizedName ?? "");
      if (!key) continue;
      // Un mismo juego puede venir repetido (versión PS4 y PS5 del mismo
      // título): nos quedamos con el contador más alto, no con el último.
      byName.set(key, Math.max(byName.get(key) ?? 0, minutes));
    }

    // El corte NO puede ser `titles.length < PAGE_LIMIT`: PSN devuelve páginas
    // más chicas que el limit pedido y con eso se cortaba en la primera,
    // dejando sin horas a toda la biblioteca salvo los últimos jugados.
    offset += titles.length;
    const total = response.totalItemCount ?? 0;
    if (titles.length === 0 || offset >= total) break;
  }

  return { byName, titlesFetched };
}
