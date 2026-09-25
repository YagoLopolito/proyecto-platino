"use client";

import { useState, useTransition } from "react";
import { GameArt } from "@/components/game/GameArt";
import { useRouter } from "next/navigation";
import type { GameScreenshot } from "@/lib/diary/screenshots";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { FormError } from "@/components/FormError";
import { Icon } from "@/components/ui/Icon";
import { FullscreenImage } from "@/components/ui/ImageLightbox";
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
 *
 * Las imágenes van por `GameArt` como el resto del arte de la app: sin el
 * optimizador de Vercel (el plan Hobby da 5.000 transformaciones por mes y ya
 * se agotaron una vez; cuando pasa, `/_next/image` deja de servir y las
 * capturas quedan rotas mientras el resto de la app se ve bien, porque todo lo
 * demás ya era `unoptimized`) y con fallback visible si una no carga.
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
  const [fullscreen, setFullscreen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  if (screenshots.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border p-8 text-center type-body text-ink-muted">
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
    setFullscreen(false);
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
              className="group relative block aspect-video w-full overflow-hidden rounded-card border border-border bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
              aria-label={screenshot.caption ?? `Captura de ${screenshot.authorLabel}`}
            >
              <GameArt
                src={screenshot.url}
                alt={screenshot.caption ?? `Captura subida por ${screenshot.authorLabel}`}
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform group-hover:scale-105"
                fallback={
                  <span className="flex h-full w-full items-center justify-center px-2 text-center type-caption text-ink-muted">
                    No se pudo cargar la captura
                  </span>
                }
              />
              {screenshot.caption && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background to-transparent px-2 pb-1 pt-4 text-left type-caption text-ink">
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
            {/* Tocar la captura la abre a pantalla completa. */}
            <button
              type="button"
              aria-label="Ver la captura en pantalla completa"
              aria-haspopup="dialog"
              onClick={() => setFullscreen(true)}
              className="group relative block aspect-video w-full cursor-zoom-in overflow-hidden rounded-card bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
            >
              <span className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/70 text-ink">
                <Icon name="expand" className="h-4 w-4" />
              </span>
              <GameArt
                src={current.url}
                alt={current.caption ?? `Captura subida por ${current.authorLabel}`}
                sizes="(min-width: 640px) 32rem, 100vw"
                className="object-contain"
                fallback={
                  <span className="flex h-full w-full items-center justify-center px-4 text-center type-body text-ink-muted">
                    No se pudo cargar la captura
                  </span>
                }
              />
            </button>

            {screenshots.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => move(-1)}
                >
                  <Icon name="arrow-left" className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="type-caption tabular-nums text-ink-faint">
                  {(openIndex ?? 0) + 1} / {screenshots.length}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => move(1)}
                >
                  Siguiente
                  <Icon name="arrow-right" className="h-4 w-4" />
                </Button>
              </div>
            )}

            {current.isOwn ? (
              <div className="space-y-2 border-t border-border pt-3">
                <Input
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  maxLength={MAX_CAPTION_LENGTH}
                  placeholder="Texto (opcional)"
                  aria-label="Texto de la captura"
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
                <p className="whitespace-pre-line break-words border-t border-border pt-3 type-body text-ink-muted">
                  {current.caption}
                </p>
              )
            )}

            <FormError>{error}</FormError>
          </div>
        </Modal>
      )}

      {current && fullscreen && (
        <FullscreenImage
          src={current.url}
          alt={current.caption ?? `Captura subida por ${current.authorLabel}`}
          onClose={() => setFullscreen(false)}
        >
          {screenshots.length > 1 && (
            <div className="flex items-center justify-between gap-2 text-white">
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label="Captura anterior"
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
              >
                <Icon name="arrow-left" className="h-5 w-5" />
              </button>
              <span className="type-caption tabular-nums">
                {(openIndex ?? 0) + 1} / {screenshots.length}
              </span>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="Captura siguiente"
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
              >
                <Icon name="arrow-right" className="h-5 w-5" />
              </button>
            </div>
          )}
        </FullscreenImage>
      )}
    </>
  );
}
