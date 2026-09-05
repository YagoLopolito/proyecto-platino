"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerScreenshots } from "@/app/(app)/juegos/[id]/diario/screenshot-actions";
import {
  buildScreenshotPath,
  isAcceptedScreenshotType,
  MAX_CAPTION_LENGTH,
  MAX_SCREENSHOTS_PER_UPLOAD,
  MAX_SCREENSHOT_BYTES,
  SCREENSHOTS_BUCKET,
  SCREENSHOT_ACCEPT,
} from "@/lib/diary/screenshot-constants";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { FormError, FormSuccess } from "@/components/FormError";

interface PendingScreenshot {
  file: File;
  previewUrl: string;
  caption: string;
}

const MAX_MB = Math.round(MAX_SCREENSHOT_BYTES / (1024 * 1024));

/**
 * Subida de capturas: el archivo va directo del browser a Supabase Storage con
 * la sesión del usuario (un Server Action tiene límite de body y una captura
 * pesa varios MB), y recién después una Server Action indexa los paths en
 * `game_screenshots`. Ver `screenshot-actions.ts`.
 */
export default function ScreenshotUploader({ gameId }: { gameId: string }) {
  const [pending, setPending] = useState<PendingScreenshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // El input se limpia siempre: si no, elegir el mismo archivo dos veces
    // seguidas no vuelve a disparar el change.
    event.target.value = "";
    if (files.length === 0) return;

    setSuccess(null);

    const rejected: string[] = [];
    const accepted: PendingScreenshot[] = [];
    for (const file of files) {
      if (!isAcceptedScreenshotType(file.type)) {
        rejected.push(`${file.name} (formato no soportado)`);
      } else if (file.size > MAX_SCREENSHOT_BYTES) {
        rejected.push(`${file.name} (pesa más de ${MAX_MB} MB)`);
      } else {
        accepted.push({ file, previewUrl: URL.createObjectURL(file), caption: "" });
      }
    }

    const room = MAX_SCREENSHOTS_PER_UPLOAD - pending.length;
    if (accepted.length > room) {
      for (const extra of accepted.slice(room)) URL.revokeObjectURL(extra.previewUrl);
      accepted.length = Math.max(0, room);
      rejected.push(`solo entran ${MAX_SCREENSHOTS_PER_UPLOAD} capturas por vez`);
    }

    setPending((current) => [...current, ...accepted]);
    setError(rejected.length > 0 ? `No se agregaron: ${rejected.join(", ")}.` : null);
  }

  function removePending(index: number) {
    setPending((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  function setCaption(index: number, caption: string) {
    setPending((current) => current.map((item, i) => (i === index ? { ...item, caption } : item)));
  }

  function clearPending() {
    for (const item of pending) URL.revokeObjectURL(item.previewUrl);
    setPending([]);
  }

  async function upload() {
    if (pending.length === 0 || uploading) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Tenés que iniciar sesión.");
      setUploading(false);
      return;
    }

    const uploaded: { path: string; caption: string | null }[] = [];
    const failed: string[] = [];

    for (const item of pending) {
      const path = buildScreenshotPath(user.id, gameId, item.file.type);
      const { error: uploadError } = await supabase.storage
        .from(SCREENSHOTS_BUCKET)
        .upload(path, item.file, { contentType: item.file.type, upsert: false });

      if (uploadError) {
        failed.push(`${item.file.name} (${uploadError.message})`);
      } else {
        uploaded.push({ path, caption: item.caption.trim() || null });
      }
    }

    if (uploaded.length === 0) {
      setError(`No se pudo subir: ${failed.join(", ")}.`);
      setUploading(false);
      return;
    }

    const state = await registerScreenshots({ gameId, items: uploaded });
    setUploading(false);

    if (state.error) {
      setError(state.error);
      return;
    }

    clearPending();
    setError(failed.length > 0 ? `No se pudo subir: ${failed.join(", ")}.` : null);
    setSuccess(state.success ?? "Capturas subidas.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-200">Subir capturas</h3>
        <p className="text-xs text-zinc-500">
          JPG, PNG, WebP o AVIF · hasta {MAX_MB} MB · {MAX_SCREENSHOTS_PER_UPLOAD} por vez
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={SCREENSHOT_ACCEPT}
        multiple
        onChange={onFilesSelected}
        className="sr-only"
        aria-label="Elegir capturas"
      />

      <Button
        type="button"
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        Elegir capturas
      </Button>

      {pending.length > 0 && (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {pending.map((item, index) => (
              <li
                key={item.previewUrl}
                className="space-y-2 rounded border border-zinc-800 bg-zinc-950 p-2"
              >
                <div className="relative aspect-video overflow-hidden rounded bg-zinc-900">
                  {/* Preview local (blob:), no pasa por el optimizador de Next. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={`Vista previa de ${item.file.name}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <Input
                  value={item.caption}
                  onChange={(event) => setCaption(index, event.target.value)}
                  maxLength={MAX_CAPTION_LENGTH}
                  placeholder="Texto (opcional)"
                  aria-label={`Texto de ${item.file.name}`}
                  className="text-xs"
                />
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => removePending(index)}
                  disabled={uploading}
                  className="w-full"
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>

          <Button type="button" onClick={upload} disabled={uploading} className="w-full">
            {uploading
              ? "Subiendo..."
              : `Subir ${pending.length} ${pending.length === 1 ? "captura" : "capturas"}`}
          </Button>
        </>
      )}

      <FormError>{error}</FormError>
      <FormSuccess>{success}</FormSuccess>
    </div>
  );
}
