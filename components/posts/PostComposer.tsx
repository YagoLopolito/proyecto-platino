"use client";

import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import { Label, Textarea } from "@/components/Input";
import { Icon } from "@/components/ui/Icon";
import { ToggleChip } from "@/components/ui/ToggleChip";
import {
  MAX_CAPTION_LENGTH,
  MAX_FILES_PER_POST,
  POST_MEDIA_ACCEPT,
  buildMediaPath,
  displayPathFor,
  isAcceptedMediaType,
  posterPathFor,
  type AcceptedMediaType,
} from "@/lib/posts/constants";
import { validateFile, validateFileCount } from "@/lib/posts/validation";
import { moveItem } from "@/lib/posts/order";
import { prepareMedia, type PreparedMedia } from "@/lib/posts/prepare";
import { uploadResumable, uploadSmall } from "@/lib/posts/upload";
import { abandonDraft, confirmPost, createDraftPost } from "@/lib/posts/actions";
import { GamePicker, type PickerGame } from "./GamePicker";

type ItemStatus = "preparing" | "ready" | "invalid" | "uploading" | "uploaded" | "failed";

interface ComposerItem {
  key: string;
  file: File;
  status: ItemStatus;
  error: string | null;
  prepared: PreparedMedia | null;
  /** Miniatura local (`blob:`): la imagen misma, o el poster del video. */
  previewUrl: string | null;
  progress: number;
}

/** Dónde va cada archivo en el bucket. Se fija al crear el borrador. */
interface UploadPlan {
  storagePath: string;
  displayPath: string | null;
  posterPath: string | null;
}

const UPLOAD_CONCURRENCY = 2;

/**
 * Compositor de una publicación de la Galería online: archivos (1..10, fotos y
 * videos mezclados), juego, descripción y spoiler.
 *
 * Publicar son tres pasos (ver `lib/posts/actions.ts`): crear el borrador en
 * `uploading`, subir cada archivo directo a Storage (TUS) y confirmar, que
 * revalida todo del lado del servidor. Si un archivo falla, se reintenta ese
 * solo: los demás ya subidos no se vuelven a mandar.
 */
export function PostComposer({
  gameOptions,
  initialGame,
  inModal = false,
  onCancel,
}: {
  gameOptions: PickerGame[];
  initialGame: PickerGame | null;
  /**
   * Abierto como modal (ruta interceptada). Al publicar, el detalle se abre
   * como modal sobre la pantalla de origen; como página, se navega a la página
   * del detalle (una navegación suave desde acá se interceptaría y dejaría el
   * compositor debajo del modal).
   */
  inModal?: boolean;
  /** Qué hacer al cancelar (cerrar el modal o volver atrás). */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const captionId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<ComposerItem[]>([]);
  const [game, setGame] = useState<PickerGame | null>(initialGame);
  const [caption, setCaption] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  // editing → uploading → confirming → done. `partial`: el borrador existe pero
  // algo falló (un archivo o la confirmación); se puede reintentar o quitar lo
  // que falló, pero ya no agregar ni reordenar (los paths están fijados).
  const [phase, setPhase] = useState<"editing" | "uploading" | "partial" | "confirming" | "done">(
    "editing",
  );
  const [status, setStatus] = useState("");

  const draft = useRef<{ postId: string; userId: string } | null>(null);
  const plans = useRef(new Map<string, UploadPlan>());
  const objectUrls = useRef(new Set<string>());
  // Espejo de `items` para el código async (subidas que terminan después de
  // varios renders). Se sincroniza en un effect, nunca durante el render.
  const itemsRef = useRef<ComposerItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const locked = phase !== "editing";
  const busy = phase === "uploading" || phase === "confirming";

  // Liberar las miniaturas `blob:` al desmontar (efecto del browser, no estado).
  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Avisar antes de cerrar la pestaña a mitad de una subida.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const patchItem = useCallback((key: string, patch: Partial<ComposerItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  function trackUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    objectUrls.current.add(url);
    return url;
  }

  function addFiles(list: FileList | File[]) {
    if (locked) return;
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    const room = MAX_FILES_PER_POST - items.length;
    if (incoming.length > room) {
      setFormError(
        `Una publicación puede tener hasta ${MAX_FILES_PER_POST} archivos: ${
          room > 0
            ? `agregaste ${incoming.length - room} de más y quedaron afuera.`
            : "ya llegaste al máximo."
        }`,
      );
    } else {
      setFormError(null);
    }

    const accepted = incoming.slice(0, Math.max(0, room));
    const fresh: ComposerItem[] = accepted.map((file) => {
      const error = validateFile(file);
      return {
        key: crypto.randomUUID(),
        file,
        status: error ? "invalid" : "preparing",
        error,
        prepared: null,
        previewUrl: !error && file.type.startsWith("image/") ? trackUrl(file) : null,
        progress: 0,
      };
    });
    setItems((current) => [...current, ...fresh]);

    for (const item of fresh) {
      if (item.status !== "preparing" || !isAcceptedMediaType(item.file.type)) continue;
      const declared: AcceptedMediaType = item.file.type;
      void prepareMedia(item.file, declared).then((result) => {
        if (!result.ok) {
          patchItem(item.key, { status: "invalid", error: result.error });
          return;
        }
        patchItem(item.key, {
          status: "ready",
          prepared: result.media,
          previewUrl: result.media.poster ? trackUrl(result.media.poster) : item.previewUrl,
        });
      });
    }
  }

  function removeAt(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
    setFormError(null);
  }

  function move(from: number, to: number) {
    setItems((current) => moveItem(current, from, to));
  }

  function onDropZone(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }

  function onDropOnItem(event: DragEvent<HTMLLIElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    if (draggedKey === null) {
      if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
      return;
    }
    const from = items.findIndex((item) => item.key === draggedKey);
    if (from !== -1) move(from, index);
    setDraggedKey(null);
  }

  async function uploadItem(item: ComposerItem): Promise<boolean> {
    const plan = plans.current.get(item.key);
    const prepared = item.prepared;
    if (!plan || !prepared) return false;
    patchItem(item.key, { status: "uploading", error: null });
    try {
      await uploadResumable(prepared.original, plan.storagePath, prepared.mimeType, (fraction) =>
        // El original es casi todo el peso; las miniaturas cierran el último 2%.
        patchItem(item.key, { progress: Math.min(0.98, fraction * 0.98) }),
      ).promise;
      if (plan.displayPath && prepared.display) {
        await uploadSmall(prepared.display, plan.displayPath, prepared.display.type);
      }
      if (plan.posterPath && prepared.poster) {
        await uploadSmall(prepared.poster, plan.posterPath, "image/jpeg");
      }
      patchItem(item.key, { status: "uploaded", progress: 1 });
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Error de red.";
      patchItem(item.key, {
        status: "failed",
        error: `No se pudo subir: ${message.split("\n")[0]}`,
      });
      return false;
    }
  }

  async function confirm(current: ComposerItem[]) {
    const draftInfo = draft.current;
    if (!draftInfo) return;
    setPhase("confirming");
    setStatus("Publicando…");
    const media = current.map((item, position) => {
      const plan = plans.current.get(item.key)!;
      const prepared = item.prepared!;
      return {
        position,
        storagePath: plan.storagePath,
        displayPath: plan.displayPath,
        posterPath: plan.posterPath,
        mimeType: prepared.mimeType,
        width: prepared.width,
        height: prepared.height,
        durationSeconds: prepared.durationSeconds,
      };
    });
    const result = await confirmPost({ postId: draftInfo.postId, media });
    if (result.status === "error") {
      setPhase("partial");
      setStatus("");
      setFormError(result.message);
      return;
    }
    setPhase("done");
    setStatus("¡Publicado!");
    if (inModal) router.replace(`/publicaciones/${result.postId}`);
    else window.location.replace(`/publicaciones/${result.postId}`);
  }

  /** Sube lo pendiente (con concurrencia limitada) y, si todo llegó, confirma. */
  async function uploadPending(current: ComposerItem[]) {
    setPhase("uploading");
    setStatus("Subiendo archivos…");
    const queue = current.filter((item) => item.status !== "uploaded");
    let failed = 0;
    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        if (!(await uploadItem(next))) failed++;
      }
    });
    await Promise.all(workers);
    if (failed > 0) {
      setPhase("partial");
      setStatus("");
      setFormError(
        failed === 1
          ? "Un archivo no se pudo subir. Reintentalo o quitalo."
          : `${failed} archivos no se pudieron subir. Reintentalos o quitalos.`,
      );
      return;
    }
    await confirm(current);
  }

  async function publish() {
    setFormError(null);
    setGameError(null);
    if (!game) {
      setGameError("Elegí de qué juego es la publicación.");
      return;
    }
    const countError = validateFileCount(items.length);
    if (countError) {
      setFormError(countError);
      return;
    }
    if (items.some((item) => item.status === "invalid")) {
      setFormError("Quitá los archivos con error antes de publicar.");
      return;
    }
    if (items.some((item) => item.status === "preparing")) {
      setFormError("Esperá a que terminen de procesarse los archivos.");
      return;
    }
    if (caption.length > MAX_CAPTION_LENGTH) {
      setFormError(`La descripción puede tener hasta ${MAX_CAPTION_LENGTH} caracteres.`);
      return;
    }

    if (draft.current) {
      // Reintento después de un fallo: sube lo que falta (sin lo que se quitó).
      await uploadPending(itemsRef.current);
      return;
    }
    // Primera vez: el borrador fija dónde va cada archivo en el bucket.
    setPhase("uploading");
    setStatus("Preparando la publicación…");
    const created = await createDraftPost({ gameId: game.id, caption, isSpoiler });
    if (created.status === "error") {
      setPhase("editing");
      setStatus("");
      setFormError(created.message);
      return;
    }
    draft.current = { postId: created.postId, userId: created.userId };
    items.forEach((item, position) => {
      const prepared = item.prepared!;
      const storagePath = buildMediaPath(
        created.userId,
        created.postId,
        position,
        prepared.mimeType,
        crypto.randomUUID(),
      );
      plans.current.set(item.key, {
        storagePath,
        displayPath: prepared.display ? displayPathFor(storagePath) : null,
        posterPath: prepared.poster ? posterPathFor(storagePath) : null,
      });
    });
    await uploadPending(items);
  }

  async function retry(item: ComposerItem) {
    setFormError(null);
    const ok = await uploadItem(item);
    if (!ok) return;
    // Si con este ya están todos, se confirma sin que haya que tocar nada más.
    const current = itemsRef.current.map((other) =>
      other.key === item.key ? { ...other, status: "uploaded" as const } : other,
    );
    if (current.every((other) => other.status === "uploaded")) await confirm(current);
  }

  /** Después del borrador, quitar sólo vale para lo que no llegó a Storage. */
  function canRemove(item: ComposerItem): boolean {
    if (!locked) return true;
    return phase === "partial" && item.status === "failed";
  }

  async function cancel() {
    if (draft.current && phase !== "done") {
      await abandonDraft(draft.current.postId);
    }
    if (onCancel) onCancel();
    else router.back();
  }

  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const sentBytes = items.reduce((sum, item) => sum + item.file.size * item.progress, 0);
  const totalProgress = totalBytes > 0 ? sentBytes / totalBytes : 0;
  const publishDisabled =
    busy ||
    phase === "done" ||
    items.length === 0 ||
    items.some((item) => item.status === "invalid" || item.status === "preparing");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Archivos */}
      <section aria-label="Archivos de la publicación" className="space-y-3">
        <div
          onDragOver={(event) => {
            if (locked || draggedKey) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDropZone}
          data-testid="post-dropzone"
          className={`flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver ? "border-accent-ink bg-accent/10" : "border-border-strong bg-surface"
          } ${locked ? "opacity-60" : ""}`}
        >
          <Icon name="image" className="h-8 w-8 text-ink-faint" />
          <p className="type-body text-ink">
            <span className="hidden sm:inline">Arrastrá fotos y videos acá, o </span>
            <label
              htmlFor={inputId}
              className={`font-medium text-accent-ink ${locked ? "" : "cursor-pointer hover:underline"}`}
            >
              <span className="sm:hidden">Elegí fotos y videos</span>
              <span className="hidden sm:inline">elegilos de tu equipo</span>
            </label>
          </p>
          <p className="type-caption text-ink-faint">
            Hasta {MAX_FILES_PER_POST} archivos. Imágenes hasta 20 MB (JPG, PNG, WebP, GIF, AVIF) y
            videos hasta 50 MB (MP4, WebM, MOV). Se suben en calidad original.
          </p>
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            multiple
            accept={POST_MEDIA_ACCEPT}
            disabled={locked || items.length >= MAX_FILES_PER_POST}
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {items.length > 0 && (
          <>
            <p className="type-caption text-ink-muted" aria-live="polite">
              {items.length} de {MAX_FILES_PER_POST} archivos.{" "}
              {!locked &&
                items.length > 1 &&
                "El primero es la portada. Arrastralos o usá las flechas para ordenarlos."}
            </p>
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Orden del carrusel">
              {items.map((item, index) => (
                <li
                  key={item.key}
                  draggable={!locked}
                  onDragStart={(event) => {
                    setDraggedKey(item.key);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDraggedKey(null)}
                  onDragOver={(event) => {
                    if (!locked) event.preventDefault();
                  }}
                  onDrop={(event) => onDropOnItem(event, index)}
                  data-testid="post-composer-item"
                  data-filename={item.file.name}
                  className={`relative flex flex-col overflow-hidden rounded-card border bg-surface ${
                    item.error ? "border-danger" : "border-border"
                  } ${draggedKey === item.key ? "opacity-50" : ""}`}
                >
                  <div className="relative aspect-square bg-surface-hover">
                    {item.previewUrl ? (
                      // Miniatura local `blob:`: no pasa por next/image.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-ink-faint">
                        <Icon
                          name={item.file.type.startsWith("video/") ? "play" : "image"}
                          className="h-6 w-6"
                        />
                      </span>
                    )}
                    {item.file.type.startsWith("video/") && (
                      <span className="absolute left-1.5 top-1.5 rounded-chip bg-black/70 p-1 text-white">
                        <Icon name="play" className="h-3 w-3" />
                      </span>
                    )}
                    <span className="absolute right-1.5 top-1.5 rounded-chip bg-black/70 px-1.5 type-caption text-white">
                      {index + 1}
                    </span>
                    {(item.status === "uploading" || item.status === "uploaded") && (
                      <div
                        role="progressbar"
                        aria-label={`Subida de ${item.file.name}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(item.progress * 100)}
                        className="absolute inset-x-0 bottom-0 h-1 bg-black/50"
                      >
                        <div
                          className={`h-full ${item.status === "uploaded" ? "bg-success" : "bg-accent"}`}
                          style={{ width: `${Math.round(item.progress * 100)}%` }}
                        />
                      </div>
                    )}
                    {item.status === "preparing" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50 type-caption text-white">
                        Procesando…
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1 p-1">
                    {!locked ? (
                      <span className="flex">
                        <IconButton
                          icon="arrow-left"
                          label={`Mover ${item.file.name} antes`}
                          disabled={index === 0}
                          onClick={() => move(index, index - 1)}
                        />
                        <IconButton
                          icon="arrow-right"
                          label={`Mover ${item.file.name} después`}
                          disabled={index === items.length - 1}
                          onClick={() => move(index, index + 1)}
                        />
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="flex">
                      {item.status === "failed" && (
                        <IconButton
                          icon="repeat"
                          label={`Reintentar ${item.file.name}`}
                          onClick={() => void retry(item)}
                        />
                      )}
                      {canRemove(item) && (
                        <IconButton
                          icon="close"
                          label={`Quitar ${item.file.name}`}
                          onClick={() => removeAt(index)}
                        />
                      )}
                    </span>
                  </div>

                  {item.error && (
                    <p role="alert" className="px-1.5 pb-1.5 type-caption text-danger">
                      {item.error}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      {/* Datos */}
      <section aria-label="Datos de la publicación" className="space-y-5">
        <GamePicker
          options={gameOptions}
          value={game}
          onChange={(next) => {
            setGame(next);
            if (next) setGameError(null);
          }}
          disabled={locked}
          error={gameError}
        />

        <div className="space-y-1.5">
          <Label htmlFor={captionId}>
            Descripción <span className="text-ink-faint">(opcional)</span>
          </Label>
          <Textarea
            id={captionId}
            rows={4}
            value={caption}
            maxLength={MAX_CAPTION_LENGTH}
            disabled={locked}
            onChange={(event) => setCaption(event.target.value)}
            aria-describedby={`${captionId}-count`}
          />
          <p id={`${captionId}-count`} className="text-right type-caption text-ink-faint">
            {caption.length}/{MAX_CAPTION_LENGTH}
          </p>
        </div>

        <div className="space-y-1.5">
          <ToggleChip checked={isSpoiler} onChange={(next) => !locked && setIsSpoiler(next)}>
            Contiene spoilers
          </ToggleChip>
          <p className="type-caption text-ink-faint">
            Se va a ver borrosa hasta que alguien toque para revelarla.
          </p>
        </div>

        <p className="flex items-start gap-2 rounded-card bg-surface p-3 type-caption text-ink-muted">
          <Icon name="gamepad" className="mt-0.5 h-4 w-4 shrink-0" />
          Publicá sólo capturas y clips de tus juegos.
        </p>

        {busy && (
          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-label="Progreso total de la subida"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(totalProgress * 100)}
              className="h-1.5 overflow-hidden rounded-full bg-surface-hover"
            >
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${Math.round(totalProgress * 100)}%` }}
              />
            </div>
          </div>
        )}
        <p role="status" aria-live="polite" className="type-meta text-ink-muted">
          {status}
          {busy && ` ${Math.round(totalProgress * 100)}%`}
        </p>
        <FormError>{formError}</FormError>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void cancel()}
            disabled={phase === "confirming"}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void publish()} disabled={publishDisabled}>
            {busy ? "Publicando…" : phase === "partial" ? "Reintentar y publicar" : "Publicar"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: "arrow-left" | "arrow-right" | "close" | "repeat";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-chip text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:opacity-30"
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}
