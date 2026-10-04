"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/** Visible al menos este tanto para arrancar el autoplay del feed. */
const AUTOPLAY_THRESHOLD = 0.6;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Un video de una publicación.
 *
 * - Feed (`autoplay`): arranca muteado cuando está visible y es el slide
 *   activo del carrusel, y se pausa al salir de pantalla
 *   (IntersectionObserver). Con `prefers-reduced-motion` no arranca solo.
 *   Controles propios: play/pausa y sonido.
 * - Detalle: controles nativos, sin autoplay.
 *
 * `preload="metadata"`: no se baja el video entero hasta que alguien lo mira.
 */
export function PostVideo({
  src,
  poster,
  width,
  height,
  autoplay,
  active,
  label,
}: {
  src: string | null;
  poster: string | null;
  width: number;
  height: number;
  autoplay: boolean;
  /** Es el slide visible del carrusel (y no está tapado por un spoiler). */
  active: boolean;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  // Efecto del browser: observar la visibilidad (no es sincronizar estado de React).
  useEffect(() => {
    const video = videoRef.current;
    if (!autoplay || !video) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= AUTOPLAY_THRESHOLD),
      { threshold: [0, AUTOPLAY_THRESHOLD, 1] },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [autoplay]);

  // Reproducir / pausar es un efecto imperativo sobre el <video>.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (autoplay && inView && active && !prefersReducedMotion()) {
      void video.play().catch(() => undefined);
    } else if (!active || (autoplay && !inView)) {
      video.pause();
    }
  }, [autoplay, inView, active]);

  if (!src) {
    return (
      <span className="flex h-full w-full items-center justify-center text-ink-faint">
        <Icon name="play" className="h-8 w-8" />
      </span>
    );
  }

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        width={width}
        height={height}
        preload="metadata"
        playsInline
        loop={autoplay}
        muted={autoplay ? muted : undefined}
        controls={!autoplay}
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="h-full w-full bg-black object-contain"
      />
      {autoplay && (
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const video = videoRef.current;
              if (!video) return;
              if (video.paused) void video.play().catch(() => undefined);
              else video.pause();
            }}
            aria-label={playing ? "Pausar video" : "Reproducir video"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-9 sm:w-9"
          >
            {playing ? (
              <span aria-hidden="true" className="flex gap-1">
                <span className="h-3.5 w-1 rounded-sm bg-current" />
                <span className="h-3.5 w-1 rounded-sm bg-current" />
              </span>
            ) : (
              <Icon name="play" className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setMuted((current) => !current);
            }}
            aria-pressed={!muted}
            aria-label={muted ? "Activar sonido" : "Silenciar"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-9 sm:w-9"
          >
            <Icon name={muted ? "volume-off" : "volume"} className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
