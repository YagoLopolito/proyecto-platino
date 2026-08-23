"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { GameScreenshot } from "@/lib/diary/screenshots";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { FormError } from "@/components/FormError";
import { MAX_CAPTION_LENGTH } from "@/lib/diary/screenshot-constants";
import {
  deleteScreenshot,
  updateScreenshotCaption,
} from "@/app/(app)/juegos/[id]/diario/screenshot-actions";

/**
 * Grilla tipo Instagram de las capturas del juego: click en una abre el
 * lightbox con la imagen grande, el texto y quién la subió. Editar el texto y
 * borrar solo aparecen en las propias (`isOwn`); la RLS de `game_screenshots` y
 * la policy del bucket lo cortan igual del lado de la base.
 */
export default function ScreenshotGallery({
  gameId,
  screenshots,
}: {
  gameId: string;
  screenshots: GameScreenshot[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  if (screenshots.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
        Todavía no hay capturas de este juego. Subí las tuyas y armá la galería.
      </p>
    );
  }

  const current = openIndex === null ? null : (screenshots[openIndex] ?? null);

  function open(index: number) {
    setOpenIndex(index);
    setCaption(screenshots[index]?.caption ?? "");
    setError(null);
  }

  function close() {
    setOpenIndex(null);
    setError(null);
  }

  function move(delta: number) {
    if (openIndex === null) return;
    const next = (openIndex + delta + screenshots.length) % screenshots.length;
    open(next);
  }

  async function saveCaption() {
    if (!current) return;
    setBusy(true);
    const state = await updateScreenshotCaption({
      gameId,
      screenshotId: current.id,
      caption,
    });
    setBusy(false);
    setError(state.error);
    if (!state.error) startTransition(() => router.refresh());
  }

  async function remove() {
    if (!current) return;
    setBusy(true);
    const state = await deleteScreenshot({ gameId, screenshotId: current.id });
    setBusy(false);
    if (state.error) {
      setError(state.error);
      return;
    }
    close();
    startTransition(() => router.refresh());
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {screenshots.map((screenshot, index) => (
          <li key={screenshot.id}>
            <button
              type="button"
              onClick={() => open(index)}
              className="group relative block aspect-video w-full overflow-hidden rounded border border-zinc-800 bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label={screenshot.caption ?? `Captura de ${screenshot.authorLabel}`}
            >
              <Image
                src={screenshot.url}
                alt={screenshot.caption ?? `Captura subida por ${screenshot.authorLabel}`}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform group-hover:scale-105"
              />
              {screenshot.caption && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-left text-[11px] text-zinc-200">
                  {screenshot.caption}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {current && (
        <Modal
          open
          onClose={close}
          title={current.authorLabel}
          description={new Date(current.createdAt).toLocaleDateString("es-AR")}
        >
          <div className="space-y-3">
            <div className="relative aspect-video w-full overflow-hidden rounded bg-black">
              <Image
                src={current.url}
                alt={current.caption ?? `Captura subida por ${current.authorLabel}`}
                fill
                sizes="(min-width: 640px) 32rem, 100vw"
                className="object-contain"
              />
            </div>

            {screenshots.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="secondary" onClick={() => move(-1)}>
                  ← Anterior
                </Button>
                <span className="text-xs text-zinc-500 tabular-nums">
                  {(openIndex ?? 0) + 1} / {screenshots.length}
                </span>
                <Button type="button" variant="secondary" onClick={() => move(1)}>
                  Siguiente →
                </Button>
              </div>
            )}

            {current.isOwn ? (
              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <Input
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  maxLength={MAX_CAPTION_LENGTH}
                  placeholder="Texto (opcional)"
                  aria-label="Texto de la captura"
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button type="button" onClick={saveCaption} disabled={busy} className="flex-1">
                    {busy ? "Guardando..." : "Guardar texto"}
                  </Button>
                  <Button type="button" variant="danger" onClick={remove} disabled={busy}>
                    Borrar
                  </Button>
                </div>
              </div>
            ) : (
              current.caption && (
                <p className="whitespace-pre-line break-words border-t border-zinc-800 pt-3 text-sm text-zinc-300">
                  {current.caption}
                </p>
              )
            )}

            <FormError>{error}</FormError>
          </div>
        </Modal>
      )}
    </>
  );
}
