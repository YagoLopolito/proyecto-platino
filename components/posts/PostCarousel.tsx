"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";
import type { PostMediaView } from "@/lib/posts/types";
import { PostVideo } from "./PostVideo";

/** Dos toques dentro de esta ventana = doble tap (like). */
const DOUBLE_TAP_MS = 300;

/**
 * Proporción del contenedor: la del PRIMER archivo, acotada entre 4:5 (vertical)
 * y 16:9 (las capturas de PS5). Los demás slides se ven con `object-contain`
 * sobre fondo neutro dentro de ese mismo marco, así el alto no salta al pasar
 * de una foto a otra con otra proporción.
 */
export function carouselAspect(first: PostMediaView | undefined): number {
  if (!first) return 1;
  return Math.min(16 / 9, Math.max(4 / 5, first.width / first.height));
}

/**
 * Carrusel de una publicación.
 *
 * - Mobile: swipe horizontal con scroll-snap (scroll nativo, sin librería).
 * - Escritorio: flechas laterales al hover/foco y ← → con el foco adentro (o en
 *   toda la página, en el detalle: `globalKeys`).
 * - Puntos + "2/7". Spoiler: todo borroso con un "tocá para ver" encima, y los
 *   videos no arrancan hasta revelarlo.
 * - Doble tap / doble click sobre un archivo: `onDoubleTap` (like) con el
 *   corazón animado.
 */
export function PostCarousel({
  media,
  variant,
  isSpoiler,
  label,
  onDoubleTap,
  globalKeys = false,
}: {
  media: PostMediaView[];
  variant: "feed" | "detail";
  isSpoiler: boolean;
  /** "Publicación de X en Y": nombre del grupo para lectores de pantalla. */
  label: string;
  onDoubleTap?: () => void;
  globalKeys?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(!isSpoiler);
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const count = media.length;

  // Si el autor marca/desmarca el spoiler mientras está abierto, manda el server.
  const [prevSpoiler, setPrevSpoiler] = useState(isSpoiler);
  if (prevSpoiler !== isSpoiler) {
    setPrevSpoiler(isSpoiler);
    setRevealed(!isSpoiler);
  }

  function goTo(target: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(count - 1, target));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }

  // El índice sale del scroll (swipe, flechas o teclado): efecto del browser.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => setIndex(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  // ← → en toda la página (detalle): se ignora si el foco está en un campo.
  useEffect(() => {
    if (!globalKeys || count < 2) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], video")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const track = trackRef.current;
        if (!track) return;
        const current = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        const next = Math.max(
          0,
          Math.min(count - 1, current + (event.key === "ArrowRight" ? 1 : -1)),
        );
        track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [globalKeys, count]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (globalKeys) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!onDoubleTap || !revealed) return;
    if ((event.target as HTMLElement).closest("button, a, video[controls]")) return;
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      setBurst((n) => n + 1);
      onDoubleTap();
    } else {
      lastTap.current = now;
    }
  }

  const aspect = carouselAspect(media[0]);
  const isDetail = variant === "detail";

  return (
    <div
      role="group"
      aria-roledescription="carrusel"
      aria-label={label}
      tabIndex={count > 1 && !globalKeys ? 0 : undefined}
      onKeyDown={onKeyDown}
      // En el detalle de escritorio el carrusel llena la columna izquierda; en
      // mobile (y en el feed) toma la proporción del primer archivo. Va por una
      // variable CSS y no por `style.aspectRatio`, que le ganaría a `md:`.
      className={`group/carousel relative w-full select-none bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink aspect-[var(--carousel-aspect)] ${
        isDetail ? "md:aspect-auto md:h-full" : ""
      }`}
      style={{ "--carousel-aspect": aspect } as React.CSSProperties}
      data-testid="post-carousel"
    >
      <div
        ref={trackRef}
        onPointerUp={onPointerUp}
        className={`flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          revealed ? "" : "pointer-events-none"
        }`}
        // Scrollea en horizontal: SwipeTabs ignora un swipe que arranca acá,
        // así deslizar el carrusel no cambia de tab.
      >
        {media.map((item, i) => (
          <div
            key={item.id}
            role="group"
            aria-roledescription="archivo"
            aria-label={`${i + 1} de ${count}`}
            inert={i !== index}
            className="relative flex h-full w-full shrink-0 snap-center items-center justify-center overflow-hidden"
          >
            <div
              className={`h-full w-full transition-[filter] motion-reduce:transition-none ${
                revealed ? "" : "scale-110 blur-2xl"
              }`}
            >
              {item.kind === "video" ? (
                <PostVideo
                  src={item.originalSrc}
                  poster={item.posterSrc}
                  width={item.width}
                  height={item.height}
                  autoplay={!isDetail}
                  active={revealed && i === index}
                  label={`Video ${i + 1} de ${count}`}
                />
              ) : item.src ? (
                <GameArt
                  src={item.src}
                  alt={`Imagen ${i + 1} de ${count}`}
                  width={item.width}
                  height={item.height}
                  className="h-full w-full object-contain"
                  fallback={
                    <span className="flex h-full w-full items-center justify-center text-ink-faint">
                      <Icon name="image" className="h-8 w-8" />
                    </span>
                  }
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {!revealed && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/40 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          data-testid="spoiler-reveal"
        >
          <Icon name="alert" className="h-7 w-7" />
          <span className="type-subtitle">Spoiler</span>
          <span className="type-meta">Tocá para ver</span>
        </button>
      )}

      {burst > 0 && (
        <span
          key={burst}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <Icon
            name="heart"
            className="h-24 w-24 text-white drop-shadow-lg [animation:post-like-burst_700ms_ease-out_forwards] motion-reduce:[animation:none] motion-reduce:opacity-0"
          />
        </span>
      )}

      {count > 1 && revealed && (
        <>
          <ArrowButton direction="prev" disabled={index === 0} onClick={() => goTo(index - 1)} />
          <ArrowButton
            direction="next"
            disabled={index === count - 1}
            onClick={() => goTo(index + 1)}
          />
          <span
            className="absolute right-2 top-2 z-10 rounded-chip bg-black/70 px-2 py-0.5 type-caption tabular-nums text-white"
            aria-live="polite"
            data-testid="carousel-counter"
          >
            {index + 1}/{count}
          </span>
          <span
            className="absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1.5"
            aria-hidden="true"
          >
            {media.map((item, i) => (
              <span
                key={item.id}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </span>
        </>
      )}
    </div>
  );
}

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  if (disabled) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Archivo anterior" : "Archivo siguiente"}
      className={`absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black opacity-0 shadow transition-opacity focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100 md:flex ${
        direction === "prev" ? "left-2" : "right-2"
      }`}
    >
      <Icon name={direction === "prev" ? "arrow-left" : "arrow-right"} className="h-4 w-4" />
    </button>
  );
}
