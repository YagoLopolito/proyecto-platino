import "server-only";
import { getUserPlayedGames, type AuthorizationPayload } from "psn-api";
import { normalizeName } from "@/lib/catalog/dedup";
import { decideNextPage } from "./pagination";

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

/**
 * Topes de seguridad. El corte real es la página vacía (ver `pagination.ts`);
 * esto sólo evita un loop infinito si el endpoint devolviera siempre lo mismo.
 * Como PSN devuelve páginas más chicas que el `limit`, el tope de páginas se
 * calcula generoso: con bibliotecas de cientos de juegos, 30 páginas de 3
 * títulos no llegaban ni a 100.
 */
const MAX_PAGES = 80;
const MAX_TITLES = 3000;

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

/**
 * Clave de cruce. `normalizeName` deja espacios donde había puntuación o
 * caracteres no ASCII, y ahí es donde las dos fuentes se separan: la lista de
 * juegos y la de trofeos escriben distinto el mismo título (dos puntos, guiones,
 * "®"/"™", el "ō" de MARVEL Tōkon). Sacando también los espacios, esas
 * diferencias dejan de importar sin volver difuso el resto del nombre.
 */
export function playtimeMatchKey(name: string): string {
  return normalizeName(name).replaceAll(" ", "");
}

export type PsnPlaytimeResult = {
  /** Minutos jugados por `playtimeMatchKey`, para cruzar con los títulos de trofeos. */
  byName: Map<string, number>;
  /** Cuántos títulos devolvió PSN en total (para el log de resumen del sync). */
  titlesFetched: number;
};

/**
 * Una página de la lista de juegos jugados. Inyectable sólo para poder testear
 * el bucle sin red: el default es el endpoint real (misma razón por la que
 * `decideNextPage` vive aparte en `pagination.ts`).
 */
export type PlaytimePageFetcher = (offset: number) => Promise<{
  titles?: Array<{ name?: string; localizedName?: string; playDuration?: string }> | null;
  nextOffset?: number | null;
  totalItemCount?: number | null;
}>;

export async function fetchPsnPlaytime(
  authorization: AuthorizationPayload,
  accountId: string,
  fetchPage: PlaytimePageFetcher = (offset) =>
    getUserPlayedGames(authorization, accountId, {
      limit: PAGE_LIMIT,
      offset,
      categories: CATEGORIES,
    }),
): Promise<PsnPlaytimeResult> {
  const byName = new Map<string, number>();
  let offset = 0;
  let titlesFetched = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Si una página falla, se corta el recorrido pero se devuelve lo ya
    // juntado: perder todo por un error en la página 3 deja la columna sin
    // tocar en TODA la biblioteca, y como el upsert no pisa con NULL, el
    // resultado son horas viejas congeladas en los pocos juegos que alguna
    // vez cruzaron -- indistinguible de "el cruce por nombre falla".
    let response: Awaited<ReturnType<PlaytimePageFetcher>>;
    try {
      response = await fetchPage(offset);
    } catch (cause) {
      console.error(
        `[psn-sync] horas jugadas p${page}: falló la request (offset=${offset}), ` +
          `se sigue con ${byName.size} títulos ya obtenidos:`,
        cause,
      );
      break;
    }
    const titles = response.titles ?? [];
    titlesFetched += titles.length;

    let withDuration = 0;
    for (const title of titles) {
      const minutes = parsePlayDurationMinutes(title.playDuration);
      if (minutes === null || minutes <= 0) continue;
      withDuration += 1;
      const key = playtimeMatchKey(title.name ?? title.localizedName ?? "");
      if (!key) continue;
      // Un mismo juego puede venir repetido (versión PS4 y PS5 del mismo
      // título): nos quedamos con el contador más alto, no con el último.
      byName.set(key, Math.max(byName.get(key) ?? 0, minutes));
    }

    // Sin este log no hay forma de distinguir "PSN mandó pocos títulos" de
    // "los mandó pero sin playDuration" de "la paginación cortó antes": los
    // tres se ven igual desde la base (columna vacía).
    console.log(
      `[psn-sync] horas jugadas p${page}: offset=${offset} títulos=${titles.length} ` +
        `con_duracion=${withDuration} nextOffset=${response.nextOffset ?? "-"} ` +
        `totalItemCount=${response.totalItemCount ?? "-"}`,
    );

    const decision = decideNextPage(
      {
        titlesInPage: titles.length,
        nextOffset: response.nextOffset,
        totalItemCount: response.totalItemCount,
      },
      offset,
    );
    if (decision.done) break;
    offset = decision.nextOffset;
    if (titlesFetched >= MAX_TITLES) break;
  }

  return { byName, titlesFetched };
}
