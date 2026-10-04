/**
 * Preparación de un archivo en el navegador, antes de subirlo. Sólo cliente
 * (usa DOM: canvas, <video>, createImageBitmap), sin `server-only` ni "use
 * server": lo importa el compositor.
 *
 * Por archivo:
 * - tipo REAL por magic bytes (un .txt renombrado a .jpg no pasa);
 * - imágenes: se saca la metadata (GPS) sin recomprimir, y se genera aparte un
 *   derivado WebP liviano para feed y grilla. El original NO se toca más allá
 *   de recortar la metadata;
 * - videos: se comprueba que ESTE navegador lo pueda decodificar (un HEVC en
 *   Chrome no carga), y de paso se sacan las dimensiones, la duración y un
 *   poster JPEG de un frame.
 */
import {
  DISPLAY_DERIVATIVE_QUALITY,
  DISPLAY_DERIVATIVE_WIDTH,
  type AcceptedMediaType,
  type MediaKind,
  mediaKindOf,
} from "./constants";
import { SNIFF_BYTES, sniffMatchesDeclared, sniffMediaType } from "./sniff";
import { stripMetadata } from "./strip-metadata";
import { HEIC_HELP } from "./constants";

export interface PreparedMedia {
  kind: MediaKind;
  mimeType: AcceptedMediaType;
  width: number;
  height: number;
  durationSeconds: number | null;
  /** El original, sin metadata. Es lo que se sube como `storage_path`. */
  original: Blob;
  /** Derivado WebP para feed/grilla; null si no hace falta (imagen chica o GIF). */
  display: Blob | null;
  /** Frame del video; null en imágenes. */
  poster: Blob | null;
}

export type PrepareResult = { ok: true; media: PreparedMedia } | { ok: false; error: string };

const VIDEO_LOAD_TIMEOUT_MS = 15_000;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Dibuja `source` a `width` de ancho (o menos si ya es más chico) y lo exporta. */
async function renderScaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  type: "image/webp" | "image/jpeg",
): Promise<Blob | null> {
  const width = Math.min(DISPLAY_DERIVATIVE_WIDTH, sourceWidth);
  const height = Math.round((sourceHeight * width) / sourceWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, type, DISPLAY_DERIVATIVE_QUALITY);
  // Safari viejo no exporta WebP y devuelve PNG: no sirve como derivado liviano.
  if (blob && blob.type !== type)
    return type === "image/webp"
      ? renderScaled(source, sourceWidth, sourceHeight, "image/jpeg")
      : null;
  return blob;
}

async function prepareImage(
  file: File,
  mimeType: AcceptedMediaType,
  bytes: Uint8Array,
): Promise<PrepareResult> {
  const stripped = stripMetadata(mimeType, bytes);
  const original = stripped.changed
    ? new Blob([stripped.bytes as BlobPart], { type: mimeType })
    : file;

  let bitmap: ImageBitmap;
  try {
    // Aplica la orientación EXIF igual que la va a mostrar el navegador.
    bitmap = await createImageBitmap(original, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, error: `“${file.name}” no se puede abrir en este navegador.` };
  }
  const { width, height } = bitmap;
  // GIF: el derivado sería un cuadro estático; feed y grilla usan el original.
  const needsDerivative = mimeType !== "image/gif" && width > DISPLAY_DERIVATIVE_WIDTH;
  const display = needsDerivative ? await renderScaled(bitmap, width, height, "image/webp") : null;
  bitmap.close();

  return {
    ok: true,
    media: {
      kind: "image",
      mimeType,
      width,
      height,
      durationSeconds: null,
      original,
      display,
      poster: null,
    },
  };
}

function prepareVideo(file: File, mimeType: AcceptedMediaType): Promise<PrepareResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    let settled = false;
    const finish = (result: PrepareResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const unplayable = () =>
      finish({
        ok: false,
        error: `“${file.name}” no se puede reproducir en este navegador (suele pasar con videos HEVC del iPhone). Exportalo como MP4 (H.264).`,
      });
    const timer = setTimeout(unplayable, VIDEO_LOAD_TIMEOUT_MS);

    video.addEventListener("error", unplayable);
    video.addEventListener("loadedmetadata", () => {
      if (!video.videoWidth || !video.videoHeight) return unplayable();
      // Un frame un poco adentro: el primero suele ser negro.
      video.currentTime = Math.min(0.5, (video.duration || 0) / 2);
    });
    video.addEventListener("seeked", async () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const poster = await renderScaled(video, width, height, "image/jpeg");
      if (!poster) return unplayable();
      const duration = Number.isFinite(video.duration)
        ? Math.round(video.duration * 100) / 100
        : null;
      finish({
        ok: true,
        media: {
          kind: "video",
          mimeType,
          width,
          height,
          durationSeconds: duration,
          original: file,
          display: null,
          poster,
        },
      });
    });

    video.src = url;
  });
}

/**
 * Prepara un archivo ya validado por tipo declarado y tamaño
 * (`validateFile`). Devuelve el error para mostrar en su miniatura.
 */
export async function prepareMedia(
  file: File,
  declared: AcceptedMediaType,
): Promise<PrepareResult> {
  const kind = mediaKindOf(declared);
  // Para videos alcanza con los primeros bytes; para imágenes hace falta todo
  // (se recorta la metadata) y pesan como mucho 20 MB.
  const bytes = new Uint8Array(
    await (kind === "image" ? file : file.slice(0, SNIFF_BYTES)).arrayBuffer(),
  );
  const head = bytes.subarray(0, SNIFF_BYTES);
  if (sniffMediaType(head) === "image/heic") return { ok: false, error: HEIC_HELP };
  if (!sniffMatchesDeclared(declared, head)) {
    return { ok: false, error: `“${file.name}” no es realmente una imagen o un video admitido.` };
  }
  return kind === "image" ? prepareImage(file, declared, bytes) : prepareVideo(file, declared);
}
