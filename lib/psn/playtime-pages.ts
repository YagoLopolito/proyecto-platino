/**
 * Recorrido de la lista de "juegos jugados" de PSN, de donde salen las horas.
 * Aislado como módulo puro (sin `import "server-only"`, misma razón que
 * `pagination.ts`): no toca red ni secretos -- la página se la inyecta el
 * caller, así que el bucle se puede testear sin la API real. El wiring con
 * `psn-api` vive en `playtime.ts`.
 */
import { normalizeName } from "@/lib/catalog/normalize";
import { decideNextPage } from "./pagination";

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
 * Sufijos que la lista de TROFEOS le agrega al nombre del juego y la lista de
 * juegos jugados no: "EA SPORTS FC™ 26 Trophies", "Risk of Rain 2 Trophy Set",
 * "Empire of Sin Trophy Set". Son el nombre del set de trofeos, no del juego.
 * Se sacan sólo del final, nunca del medio: "Trophy" puede ser parte legítima
 * del título de un juego.
 */
const TROPHY_SET_SUFFIXES = ["trophies", "trophy set", "trophy list", "trophy pack"];

/**
 * Sufijo de plataforma, que aparece de un lado y del otro no
 * ("Grand Theft Auto V (PlayStation®5)"). Después de `normalizeName` el
 * paréntesis ya es un espacio, así que se compara contra el final del string.
 */
const PLATFORM_SUFFIXES = ["playstation 4", "playstation 5", "ps4", "ps5"];

/**
 * Clave de cruce. `normalizeName` deja espacios donde había puntuación o
 * caracteres no ASCII, y ahí es donde las dos fuentes se separan: la lista de
 * juegos y la de trofeos escriben distinto el mismo título (dos puntos, guiones,
 * "®"/"™", el "ō" de MARVEL Tōkon). Sacando también los espacios, esas
 * diferencias dejan de importar sin volver difuso el resto del nombre.
 *
 * Además se sacan los sufijos de arriba, que son la otra fuente sistemática de
 * fallos: sin esto, ninguno de los "… Trophies" cruzaba y esos juegos quedaban
 * sin horas para siempre.
 */
export function playtimeMatchKey(name: string): string {
  let normalized = normalizeName(name);
  // En bucle porque se pueden acumular ("… (PlayStation®5) Trophies").
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of [...TROPHY_SET_SUFFIXES, ...PLATFORM_SUFFIXES]) {
      if (normalized.endsWith(` ${suffix}`)) {
        normalized = normalized.slice(0, -suffix.length - 1).trim();
        changed = true;
      }
    }
  }
  return normalized.replaceAll(" ", "");
}

export type PsnPlaytimeResult = {
  /** Minutos jugados por `playtimeMatchKey`, para cruzar con los títulos de trofeos. */
  byName: Map<string, number>;
  /** Cuántos títulos devolvió PSN en total (para el log de resumen del sync). */
  titlesFetched: number;
};

/** Una página de la lista de juegos jugados, tal como la devuelve PSN. */
export type PlaytimePageFetcher = (offset: number) => Promise<{
  titles?: Array<{ name?: string; localizedName?: string; playDuration?: string }> | null;
  nextOffset?: number | null;
  totalItemCount?: number | null;
}>;

export async function collectPlaytimePages(
  fetchPage: PlaytimePageFetcher,
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
