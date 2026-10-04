/**
 * Galería online: todos los límites en un solo lugar. Módulo puro, sin
 * `server-only`: lo usan el compositor (client), las Server Actions, las
 * queries y los specs.
 *
 * Los tipos y el tope por archivo están repetidos A PROPÓSITO en el bucket
 * `post-media` (migración `20261004000000_posts.sql`): Storage rechaza la subida
 * antes de que el server vea nada, así que si se cambian acá hay que cambiarlos
 * también allá. Los largos de texto tienen que coincidir con los `check`.
 */
export const POST_MEDIA_BUCKET = "post-media";

/** 1..10 archivos por publicación (carrusel), como Instagram. */
export const MIN_FILES_PER_POST = 1;
export const MAX_FILES_PER_POST = 10;

/**
 * Supabase Free corta en 50 MB por archivo (`file_size_limit` del bucket) y el
 * proyecto entero tiene 1 GB de Storage: un video tiene que ser un clip corto.
 * Si se pasa a Pro, alcanza con subir estos dos números y el del bucket.
 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/**
 * mp4 y webm son lo que exporta la PS5. `.mov` se acepta sólo si el navegador
 * de quien sube lo puede reproducir (H.264 sí, HEVC en Chrome no): el
 * compositor lo comprueba cargándolo en un `<video>` antes de dejar publicar.
 */
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];
export type AcceptedVideoType = (typeof ACCEPTED_VIDEO_TYPES)[number];
export type AcceptedMediaType = AcceptedImageType | AcceptedVideoType;
export type MediaKind = "image" | "video";

/** Valor del `accept` del <input type="file">. Sin heic: así iOS convierte a JPEG solo. */
export const POST_MEDIA_ACCEPT = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(",");

/** HEIC/HEIF: Chrome y Firefox no los dibujan. Se rechazan con este mensaje. */
export const HEIC_TYPES = [
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
];
export const HEIC_HELP =
  "Las fotos HEIC no se ven en todos los navegadores. Convertilas a JPG (en iPhone: Ajustes › Cámara › Formatos › Más compatible).";

export const MAX_CAPTION_LENGTH = 2200;
export const MAX_COMMENT_LENGTH = 500;

/** Paginación numerada (`?page=N`). Páginas largas a propósito. */
export const FEED_PAGE_SIZE = 30;
export const GRID_PAGE_SIZE = 45;

/** Comentarios que se muestran debajo de un post en el feed (el detalle trae todos). */
export const FEED_COMMENTS_PREVIEW = 2;

/** Ancho del derivado liviano que generan feed y grilla (el original no se toca). */
export const DISPLAY_DERIVATIVE_WIDTH = 1080;
export const DISPLAY_DERIVATIVE_QUALITY = 0.85;

/** Duración de las URLs firmadas de lectura. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Un post que sigue en subida después de esto se considera abandonado (cron). */
export const ABANDONED_UPLOAD_HOURS = 24;

const EXTENSION_BY_TYPE: Record<AcceptedMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function isAcceptedMediaType(type: string): type is AcceptedMediaType {
  return type in EXTENSION_BY_TYPE;
}

export function mediaKindOf(type: AcceptedMediaType): MediaKind {
  return type.startsWith("video/") ? "video" : "image";
}

export function maxBytesFor(kind: MediaKind): number {
  return kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

/** "20 MB" para los mensajes de error. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Path del original dentro del bucket: `{user}/{post}/{position}-{uuid}.{ext}`.
 * Las dos primeras carpetas son las que atan las policies de storage.objects
 * (dueño + post en subida) y las que revalida `confirmPost`.
 */
export function buildMediaPath(
  userId: string,
  postId: string,
  position: number,
  type: AcceptedMediaType,
  uuid: string,
): string {
  return `${userId}/${postId}/${position}-${uuid}.${EXTENSION_BY_TYPE[type]}`;
}

/** Derivado WebP de un original (`…-display.webp`). */
export function displayPathFor(storagePath: string): string {
  return storagePath.replace(/\.[a-z0-9]+$/, "-display.webp");
}

/** Poster JPEG de un video (`…-poster.jpg`). */
export function posterPathFor(storagePath: string): string {
  return storagePath.replace(/\.[a-z0-9]+$/, "-poster.jpg");
}

/** `{user}/{post}/` de un path, o null si no tiene esa forma. */
export function parseMediaPath(path: string): { userId: string; postId: string } | null {
  const match = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/[^/]+$/.exec(path);
  return match ? { userId: match[1], postId: match[2] } : null;
}
