/**
 * Formas de una publicación tal como llega a la UI (ya con URLs firmadas y
 * nombres resueltos). Puro: lo importan componentes cliente y servidor.
 */
import type { MediaKind, PostKind } from "./constants";

export interface PostPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface PostMediaView {
  id: string;
  position: number;
  kind: MediaKind;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number | null;
  /**
   * Lo que se muestra en el lugar: en la grilla y el feed, el derivado liviano
   * (o el poster de un video); en el detalle, el original.
   */
  src: string | null;
  /** El original (feed y detalle; la pantalla completa siempre usa éste). */
  originalSrc: string | null;
  /** Poster de un video. */
  posterSrc: string | null;
}

export interface PostComment {
  id: string;
  body: string;
  createdAt: string;
  author: PostPerson;
  /** Lo puede borrar quien mira (autor del comentario o del post). */
  canDelete: boolean;
}

export interface PostView {
  id: string;
  caption: string | null;
  isSpoiler: boolean;
  /** `platinum`: la card "¡Platiné X!", que el feed muestra con borde metálico. */
  kind: PostKind;
  publishedAt: string;
  editedAt: string | null;
  isOwn: boolean;
  author: PostPerson;
  game: { id: string; name: string; coverUrl: string | null };
  media: PostMediaView[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  /** En el feed, los últimos comentarios (más viejo primero); en el detalle, todos. */
  comments: PostComment[];
}

export type PostsPage =
  | { status: "ok"; posts: PostView[]; total: number; page: number; pageCount: number }
  | { status: "error"; message: string };
