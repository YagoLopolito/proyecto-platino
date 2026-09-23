/**
 * Tipos y helpers puros de los likes (sin `server-only`): los usan también
 * componentes que no saben si los monta un Server Component.
 */

/** Los likes de una reseña o una lista, vistos por quien mira. */
export interface LikeState {
  count: number;
  /** Quien mira ya le dio like. */
  liked: boolean;
}

const NO_LIKES: LikeState = { count: 0, liked: false };

/** El estado de un id que no tiene ninguna fila (el `Map` sólo trae los que sí). */
export function likeStateOf(likes: Map<string, LikeState>, id: string): LikeState {
  return likes.get(id) ?? NO_LIKES;
}
