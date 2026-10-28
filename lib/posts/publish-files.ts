/**
 * Publicar un lote de archivos de una sola vez, sin UI de por medio: el mismo
 * flujo de tres pasos que el compositor (borrador → subida directa → confirmar
 * con validación en el servidor), para el importador masivo de
 * `/diario/capturas`. Sólo cliente.
 */
import {
  buildMediaPath,
  displayPathFor,
  isAcceptedMediaType,
  posterPathFor,
  type PostKind,
} from "./constants";
import { prepareMedia, type PreparedMedia } from "./prepare";
import { uploadResumable, uploadSmall } from "./upload";
import { abandonDraft, confirmPost, createDraftPost } from "./actions";
import { validateFile } from "./validation";

export type PublishFilesResult =
  | { status: "ok"; postId: string; skipped: string[] }
  | { status: "error"; message: string; skipped: string[] };

/**
 * Publica `files` (1..10) como UNA publicación del juego `gameId`. Los
 * archivos que no pasan la validación se saltean y se informan en `skipped`;
 * si no queda ninguno, no se crea nada.
 */
export async function publishFiles(input: {
  gameId: string;
  files: File[];
  caption?: string;
  isSpoiler?: boolean;
  /** `platinum` para la card "¡Platiné X!" (ver `POST_KINDS`). */
  kind?: PostKind;
  onFileDone?: () => void;
}): Promise<PublishFilesResult> {
  const skipped: string[] = [];
  const ready: PreparedMedia[] = [];
  for (const file of input.files) {
    const error = validateFile(file);
    if (error || !isAcceptedMediaType(file.type)) {
      skipped.push(error ?? file.name);
      input.onFileDone?.();
      continue;
    }
    const prepared = await prepareMedia(file, file.type);
    if (!prepared.ok) {
      skipped.push(prepared.error);
      input.onFileDone?.();
      continue;
    }
    ready.push(prepared.media);
  }
  if (ready.length === 0)
    return { status: "error", message: "Ningún archivo se pudo preparar.", skipped };

  const draft = await createDraftPost({
    gameId: input.gameId,
    caption: input.caption ?? "",
    isSpoiler: input.isSpoiler ?? false,
    kind: input.kind,
  });
  if (draft.status === "error") return { status: "error", message: draft.message, skipped };

  try {
    const media = [];
    for (const [position, item] of ready.entries()) {
      const storagePath = buildMediaPath(
        draft.userId,
        draft.postId,
        position,
        item.mimeType,
        crypto.randomUUID(),
      );
      const displayPath = item.display ? displayPathFor(storagePath) : null;
      const posterPath = item.poster ? posterPathFor(storagePath) : null;
      await uploadResumable(item.original, storagePath, item.mimeType, () => undefined).promise;
      if (displayPath && item.display)
        await uploadSmall(item.display, displayPath, item.display.type);
      if (posterPath && item.poster) await uploadSmall(item.poster, posterPath, "image/jpeg");
      input.onFileDone?.();
      media.push({
        position,
        storagePath,
        displayPath,
        posterPath,
        mimeType: item.mimeType,
        width: item.width,
        height: item.height,
        durationSeconds: item.durationSeconds,
      });
    }
    const confirmed = await confirmPost({ postId: draft.postId, media });
    if (confirmed.status === "error") {
      await abandonDraft(draft.postId);
      return { status: "error", message: confirmed.message, skipped };
    }
    return { status: "ok", postId: draft.postId, skipped };
  } catch (cause) {
    await abandonDraft(draft.postId);
    return {
      status: "error",
      message: cause instanceof Error ? cause.message : "No se pudo subir.",
      skipped,
    };
  }
}
