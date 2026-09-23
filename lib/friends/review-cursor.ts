/**
 * Cursor de la paginación del feed de reseñas de amigos (Biblioteca › Reseñas,
 * epic #183, issue #191). Puro y sin `server-only`: lo usan la query y la
 * Server Action, y se testea directo desde el spec.
 *
 * Es un cursor de *keyset* sobre el mismo orden de la query
 * (`finished_on desc, created_at desc, id desc`) y no un offset: si un amigo
 * registra una partida mientras leés, un offset repetiría la última reseña de
 * la página anterior al pedir la siguiente. El `id` desempata dos entradas
 * creadas en el mismo instante, así el orden es total.
 */
export interface ReviewCursor {
  finishedOn: string;
  createdAt: string;
  id: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeReviewCursor(cursor: ReviewCursor): string {
  return Buffer.from(JSON.stringify([cursor.finishedOn, cursor.createdAt, cursor.id])).toString(
    "base64url",
  );
}

/**
 * `null` para cualquier cosa que no sea un cursor que emitimos nosotros: el
 * valor viaja por el cliente, y termina interpolado en un filtro de PostgREST,
 * así que se valida campo por campo en vez de confiar en el JSON.
 */
export function decodeReviewCursor(raw: string | null | undefined): ReviewCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [finishedOn, createdAt, id] = parsed;
    if (typeof finishedOn !== "string" || !DATE.test(finishedOn)) return null;
    if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) return null;
    if (/[",()]/.test(createdAt)) return null;
    if (typeof id !== "string" || !UUID.test(id)) return null;
    return { finishedOn, createdAt, id };
  } catch {
    return null;
  }
}

/**
 * El filtro `or` de PostgREST equivalente a
 * `(finished_on, created_at, id) < (cursor)` con los tres descendentes.
 * `created_at` va entre comillas: un timestamp trae `:` y `+`.
 */
export function reviewCursorFilter(cursor: ReviewCursor): string {
  const { finishedOn: f, createdAt: c, id } = cursor;
  return [
    `finished_on.lt.${f}`,
    `and(finished_on.eq.${f},created_at.lt."${c}")`,
    `and(finished_on.eq.${f},created_at.eq."${c}",id.lt.${id})`,
  ].join(",");
}
