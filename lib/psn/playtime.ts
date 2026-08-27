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
const PAGE_LIMIT = 200;

/** Tope de páginas, por si la paginación de PSN devolviera algo inesperado. */
const MAX_PAGES = 20;

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

/** Minutos jugados por nombre de juego normalizado, para cruzar con los títulos de trofeos. */
export async function fetchPsnPlaytimeByName(
  authorization: AuthorizationPayload,
  accountId: string,
): Promise<Map<string, number>> {
  const byName = new Map<string, number>();
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await getUserPlayedGames(authorization, accountId, {
      limit: PAGE_LIMIT,
      offset,
    });
    const titles = response.titles ?? [];

    for (const title of titles) {
      const minutes = parsePlayDurationMinutes(title.playDuration);
      if (minutes === null || minutes <= 0) continue;
      const key = normalizeName(title.name ?? title.localizedName ?? "");
      if (!key) continue;
      // Un mismo juego puede venir repetido (versión PS4 y PS5 del mismo
      // título): nos quedamos con el contador más alto, no con el último.
      byName.set(key, Math.max(byName.get(key) ?? 0, minutes));
    }

    offset += titles.length;
    if (titles.length < PAGE_LIMIT || offset >= (response.totalItemCount ?? offset)) break;
  }

  return byName;
}
