/**
 * Validaciones de la Galería online, compartidas entre el compositor (client) y
 * las Server Actions: el cliente las usa para avisar antes de subir, y el
 * servidor las repite sobre lo que efectivamente quedó en Storage. Módulo puro.
 */
import { z } from "zod";
import {
  HEIC_HELP,
  HEIC_TYPES,
  MAX_CAPTION_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_FILES_PER_POST,
  MIN_FILES_PER_POST,
  formatMegabytes,
  isAcceptedMediaType,
  maxBytesFor,
  mediaKindOf,
} from "./constants";

/** Lo mínimo de un `File` que hace falta para validarlo (testeable sin DOM). */
export interface FileLike {
  name: string;
  type: string;
  size: number;
}

const HEIC_EXTENSION = /\.(heic|heif)$/i;

/** El error de un archivo suelto, o null si se puede subir. */
export function validateFile(file: FileLike): string | null {
  if (HEIC_TYPES.includes(file.type.toLowerCase()) || HEIC_EXTENSION.test(file.name)) {
    return HEIC_HELP;
  }
  if (!isAcceptedMediaType(file.type)) {
    return `“${file.name}” no es un formato admitido. Usá JPG, PNG, WebP, GIF, AVIF, MP4, WebM o MOV.`;
  }
  if (file.size <= 0) return `“${file.name}” está vacío.`;
  const kind = mediaKindOf(file.type);
  const max = maxBytesFor(kind);
  if (file.size > max) {
    return `“${file.name}” pesa ${formatMegabytes(file.size)}: el máximo para ${
      kind === "video" ? "un video" : "una imagen"
    } es ${formatMegabytes(max)}.`;
  }
  return null;
}

/** El error de la cantidad de archivos, o null. */
export function validateFileCount(count: number): string | null {
  if (count < MIN_FILES_PER_POST) return "Elegí al menos una foto o un video.";
  if (count > MAX_FILES_PER_POST) {
    return `Una publicación puede tener hasta ${MAX_FILES_PER_POST} archivos (elegiste ${count}).`;
  }
  return null;
}

export interface FilesValidation {
  /** Error de cantidad, si lo hay. */
  countError: string | null;
  /** Un error (o null) por archivo, en el mismo orden. */
  fileErrors: (string | null)[];
  ok: boolean;
}

export function validateFiles(files: readonly FileLike[]): FilesValidation {
  const countError = validateFileCount(files.length);
  const fileErrors = files.map(validateFile);
  return { countError, fileErrors, ok: countError === null && fileErrors.every((e) => e === null) };
}

/** Descripción: opcional, se recorta, vacía = null. */
export const captionSchema = z
  .string()
  .max(MAX_CAPTION_LENGTH, `La descripción puede tener hasta ${MAX_CAPTION_LENGTH} caracteres.`)
  .transform((value) => value.trim())
  .transform((value) => (value === "" ? null : value));

export const commentSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "Escribí un comentario.")
      .max(MAX_COMMENT_LENGTH, `Un comentario puede tener hasta ${MAX_COMMENT_LENGTH} caracteres.`),
  );

const uuid = z.string().uuid();

/** Un archivo ya subido, como lo describe el cliente al confirmar. */
export const confirmedMediaSchema = z.object({
  position: z
    .number()
    .int()
    .min(0)
    .max(MAX_FILES_PER_POST - 1),
  storagePath: z.string().min(1),
  displayPath: z.string().min(1).nullable(),
  posterPath: z.string().min(1).nullable(),
  mimeType: z.string(),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  durationSeconds: z.number().nonnegative().max(100000).nullable(),
});

export const confirmPostSchema = z
  .object({
    postId: uuid,
    media: z.array(confirmedMediaSchema).min(MIN_FILES_PER_POST).max(MAX_FILES_PER_POST),
  })
  .refine(
    ({ media }) =>
      [...media]
        .map((m) => m.position)
        .sort((a, b) => a - b)
        .every((position, index) => position === index),
    { message: "Las posiciones del carrusel tienen que ser 0..N-1." },
  );

export type ConfirmedMedia = z.infer<typeof confirmedMediaSchema>;
export type ConfirmPostInput = z.infer<typeof confirmPostSchema>;
