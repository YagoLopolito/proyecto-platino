/**
 * Constantes de la galería de capturas, compartidas entre el uploader (client
 * component), las Server Actions y la policy del bucket en la migración
 * `20260823000000_game_screenshots.sql`. Viven fuera de `actions.ts` porque un
 * módulo `"use server"` solo puede exportar funciones async (misma razón que
 * `lib/catalog/constants.ts`).
 *
 * Si se cambia el tamaño o los tipos acá, hay que cambiarlos también en el
 * bucket: Storage rechaza la subida antes de que el server vea nada.
 */
export const SCREENSHOTS_BUCKET = "game-screenshots";

/** 10 MB: una captura 4K en PNG entra cómoda. */
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_SCREENSHOT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** Valor del `accept` del <input type="file">. */
export const SCREENSHOT_ACCEPT = ACCEPTED_SCREENSHOT_TYPES.join(",");

/** Cuántas capturas se pueden subir de una sola vez. */
export const MAX_SCREENSHOTS_PER_UPLOAD = 10;

export const MAX_CAPTION_LENGTH = 280;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function isAcceptedScreenshotType(type: string): boolean {
  return (ACCEPTED_SCREENSHOT_TYPES as readonly string[]).includes(type);
}

/**
 * Path dentro del bucket. La primera carpeta es SIEMPRE el uuid del usuario:
 * es lo que chequea la policy de `storage.objects`, y lo que revalida la
 * Server Action antes de insertar la fila.
 */
export function buildScreenshotPath(userId: string, gameId: string, mimeType: string): string {
  const extension = EXTENSION_BY_TYPE[mimeType] ?? "jpg";
  return `${userId}/${gameId}/${crypto.randomUUID()}.${extension}`;
}
