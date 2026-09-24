/**
 * Actividad (epic #183, issue #195): lo puro del feed. Sin `server-only`: lo
 * usan la query, la Server Action, los componentes y el spec.
 */

export type ActivityTab = "amigos" | "vos" | "recibido";

export type ActivityKind =
  | "diary"
  | "platinum"
  | "completion"
  | "playing"
  | "playlist"
  | "list_created"
  | "list_updated"
  | "like_review"
  | "like_list"
  | "liked_review"
  | "liked_list"
  | "follow";

/** Filtros de `?tipo=`: cada uno agrupa uno o más `kind` del RPC. */
export const ACTIVITY_FILTERS: Record<
  ActivityTab,
  { value: string; label: string; kinds: ActivityKind[] }[]
> = {
  amigos: [],
  vos: [
    { value: "registros", label: "Registros", kinds: ["diary"] },
    { value: "platinos", label: "Platinos y 100%", kinds: ["platinum", "completion"] },
    { value: "jugando", label: "Jugando", kinds: ["playing"] },
    { value: "playlist", label: "Playlist", kinds: ["playlist"] },
    { value: "listas", label: "Listas", kinds: ["list_created", "list_updated"] },
    { value: "likes", label: "Me gusta", kinds: ["like_review", "like_list"] },
  ],
  recibido: [
    { value: "likes", label: "Me gusta", kinds: ["liked_review", "liked_list"] },
    { value: "seguidores", label: "Seguidores", kinds: ["follow"] },
  ],
};

/** `null` = sin filtro (un valor desconocido también, no un feed vacío). */
export function kindsForFilter(tab: ActivityTab, tipo: string | null | undefined) {
  return ACTIVITY_FILTERS[tab].find((filter) => filter.value === tipo)?.kinds ?? null;
}

export function activeFilter(tab: ActivityTab, tipo: string | null | undefined): string | null {
  return ACTIVITY_FILTERS[tab].some((filter) => filter.value === tipo) ? tipo! : null;
}

// --- Cursor `(occurred_at, id)` -------------------------------------------

export interface ActivityCursor {
  occurredAt: string;
  id: string;
}

const EVENT_ID = /^[a-z_]+(:[0-9a-f-]{36}){1,2}$/;

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify([cursor.occurredAt, cursor.id])).toString("base64url");
}

/** `null` para cualquier cosa que no sea un cursor emitido por nosotros. */
export function decodeActivityCursor(raw: string | null | undefined): ActivityCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [occurredAt, id] = parsed;
    if (typeof occurredAt !== "string" || Number.isNaN(Date.parse(occurredAt))) return null;
    if (typeof id !== "string" || !EVENT_ID.test(id)) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

// --- Tiempo -----------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** "ahora", "38 min", "2 h", "1 d", "1 sem", "3 mes", "1 a". */
export function relativeTime(occurredAt: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(occurredAt));
  if (diff < MINUTE) return "ahora";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)} d`;
  if (diff < 30 * DAY) return `${Math.floor(diff / WEEK)} sem`;
  if (diff < 365 * DAY) return `${Math.floor(diff / (30 * DAY))} mes`;
  return `${Math.floor(diff / (365 * DAY))} a`;
}

/**
 * "el miércoles 23 de septiembre" (+ año si no es el actual) para un
 * `finished_on` (`YYYY-MM-DD`). Nunca `new Date("2026-09-23")`: eso es
 * medianoche UTC y en Argentina cae el día anterior. Se arma la fecha en UTC
 * con las partes del string y se formatea en UTC.
 */
export function formatDiaryDate(finishedOn: string, currentYear?: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(finishedOn);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const text = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
  const withYear = currentYear !== undefined && year !== currentYear ? `${text} de ${year}` : text;
  return `el ${withYear.replace(",", "")}`;
}
