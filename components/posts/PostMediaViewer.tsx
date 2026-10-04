"use client";

import { useEffect, useRef, useState } from "react";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";
import type { PostMediaView } from "@/lib/posts/types";

/**
 * Los archivos de una publicación a pantalla completa, sobre negro y con el
 * ORIGINAL (nunca el derivado liviano del feed).
 *
 * - Escritorio: pide pantalla completa al navegador (Fullscreen API).
 * - Celular vertical: la foto ocupa todo el ancho, ampliada respecto del feed.
 * - Celular horizontal: como se pidió fullscreen al abrir (el toque es el gesto
 *   que el navegador exige), al girarlo la foto llena la pantalla sin barras.
 * iPhone no tiene Fullscreen API para elementos: ahí queda como capa fija a
 * pantalla completa (`100dvh`), que es lo más cerca que deja Safari.
 *
 * Se cierra con ✕, Escape o saliendo del fullscreen del navegador. ← → y el
 * swipe cambian de archivo.
 */
export function PostMediaViewer({
  media,
  startIndex,
  label,
  onClose,
}: {
  media: PostMediaView[];
  startIndex: number;
  label: string;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(startIndex);
  const indexRef = useRef(startIndex);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const count = media.length;

  // Al abrir: fullscreen del navegador (si se puede), foco, scroll del body
  // bloqueado y el archivo de arranque a la vista. Efectos del browser.
  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;
    track.scrollLeft = startIndex * track.clientWidth;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let entered = false;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root
        .requestFullscreen({ navigationUI: "hide" })
        .then(() => {
          entered = true;
        })
        .catch(() => undefined);
    }
    // Si el usuario sale del fullscreen (Esc del navegador, gesto de atrás),
    // se cierra también el visor: quedaría una capa negra sin sentido.
    const onFullscreenChange = () => {
      if (entered && !document.fullscreenElement) onCloseRef.current();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onCloseRef.current();
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const current = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        const next = current + (event.key === "ArrowRight" ? 1 : -1);
        track.scrollTo({ left: Math.max(0, Math.min(count - 1, next)) * track.clientWidth });
      }
    };
    // En captura: el visor está por encima del modal del detalle y del carrusel.
    document.addEventListener("keydown", onKeyDown, true);
    const onScroll = () => {
      const next = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      indexRef.current = next;
      setIndex(next);
    };
    track.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeyDown, true);
      track.removeEventListener("scroll", onScroll);
      document.body.style.overflow = previousOverflow;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [startIndex, count]);

  // Al girar el teléfono cambia el ancho: se mantiene el mismo archivo.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => {
      track.scrollLeft = indexRef.current * track.clientWidth;
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${label}, pantalla completa`}
      data-testid="post-media-viewer"
      className="fixed inset-0 z-[70] h-[100dvh] w-screen bg-black"
    >
      <div
        ref={trackRef}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {media.map((item, i) => (
          <div
            key={item.id}
            inert={i !== index}
            className="flex h-full w-full shrink-0 snap-center items-center justify-center"
          >
            {item.kind === "video" ? (
              <video
                src={item.originalSrc ?? undefined}
                poster={item.posterSrc ?? undefined}
                controls
                playsInline
                preload="metadata"
                aria-label={`Video ${i + 1} de ${count}`}
                className="max-h-full max-w-full"
              />
            ) : (item.originalSrc ?? item.src) ? (
              <GameArt
                src={(item.originalSrc ?? item.src)!}
                alt={`Imagen ${i + 1} de ${count}`}
                width={item.width}
                height={item.height}
                className="h-full w-full object-contain"
                fallback={<Icon name="image" className="h-10 w-10 text-white/60" />}
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-2 pt-safe">
        <span className="px-2 type-meta tabular-nums text-white" aria-live="polite">
          {count > 1 ? `${index + 1}/${count}` : ""}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar pantalla completa"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Icon name="close" className="h-6 w-6" />
        </button>
      </div>

      {count > 1 && (
        <>
          {index > 0 && (
            <button
              type="button"
              aria-label="Archivo anterior"
              onClick={() => {
                const track = trackRef.current;
                if (track) track.scrollTo({ left: (index - 1) * track.clientWidth });
              }}
              className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex"
            >
              <Icon name="arrow-left" className="h-5 w-5" />
            </button>
          )}
          {index < count - 1 && (
            <button
              type="button"
              aria-label="Archivo siguiente"
              onClick={() => {
                const track = trackRef.current;
                if (track) track.scrollTo({ left: (index + 1) * track.clientWidth });
              }}
              className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex"
            >
              <Icon name="arrow-right" className="h-5 w-5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
