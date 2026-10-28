"use client";

import { useEffect, useRef } from "react";
import {
  PLATINUM_TROPHY_FALLBACK_SRC,
  PLATINUM_TROPHY_SRC,
  TROPHY_VECTOR_PATH,
  warnMissingPlatinumAsset,
} from "@/lib/platinum/assets";

export type RainIntensity = "soft" | "intense";

const CONFIG: Record<
  RainIntensity,
  { count: number; durationMs: number; minSize: number; maxSize: number }
> = {
  // La de la ficha: se dispara cada vez que entrás, así que es corta y rala.
  soft: { count: 32, durationMs: 3600, minSize: 16, maxSize: 40 },
  // La de la celebración de un platino nuevo: más densa y más larga.
  intense: { count: 72, durationMs: 5200, minSize: 20, maxSize: 56 },
};

/** Lado del sprite pre-renderizado; las partículas lo escalan para abajo. */
const SPRITE_SIZE = 128;

type Sprites = { sharp: CanvasImageSource; blurred: CanvasImageSource };

let spritesPromise: Promise<Sprites> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(src));
    image.src = src;
  });
}

/** Dibuja la fuente centrada en un canvas cuadrado, con o sin desenfoque. */
function renderSprite(draw: (ctx: CanvasRenderingContext2D) => void, blur: number) {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    if (blur > 0) ctx.filter = `blur(${blur}px)`;
    draw(ctx);
  }
  return canvas;
}

/**
 * Los sprites se arman una sola vez por sesión: el PNG oficial, el trofeo de
 * Actividad o, si no carga ninguno, la copa vectorial. La versión desenfocada
 * se pre-renderiza acá: un `filter` por partícula y por frame sería lo más
 * caro de toda la animación.
 */
function loadSprites(): Promise<Sprites> {
  spritesPromise ??= (async () => {
    let image: HTMLImageElement | null = null;
    try {
      image = await loadImage(PLATINUM_TROPHY_SRC);
    } catch {
      warnMissingPlatinumAsset(PLATINUM_TROPHY_SRC);
      image = await loadImage(PLATINUM_TROPHY_FALLBACK_SRC).catch(() => null);
    }
    const color =
      getComputedStyle(document.documentElement).getPropertyValue("--trophy-platinum").trim() ||
      "white";
    const draw = (ctx: CanvasRenderingContext2D) => {
      const pad = 10;
      if (image) {
        ctx.drawImage(image, pad, pad, SPRITE_SIZE - pad * 2, SPRITE_SIZE - pad * 2);
      } else {
        ctx.scale((SPRITE_SIZE - pad * 2) / 24, (SPRITE_SIZE - pad * 2) / 24);
        ctx.translate((pad * 24) / (SPRITE_SIZE - pad * 2), (pad * 24) / (SPRITE_SIZE - pad * 2));
        ctx.fillStyle = color;
        ctx.fill(new Path2D(TROPHY_VECTOR_PATH));
      }
    };
    return { sharp: renderSprite(draw, 0), blurred: renderSprite(draw, 3) };
  })();
  return spritesPromise;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  rotation: number;
  spin: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  blurred: boolean;
  delay: number;
}

function makeParticles(intensity: RainIntensity, width: number, height: number): Particle[] {
  const { count, durationMs, minSize, maxSize } = CONFIG[intensity];
  return Array.from({ length: count }, () => {
    const size = minSize + Math.random() * (maxSize - minSize);
    // Las chicas caen más lento y desenfocadas: dan la profundidad.
    const depth = (size - minSize) / (maxSize - minSize);
    const delay = Math.random() * durationMs * 0.35;
    const travel = height + size * 2;
    return {
      x: Math.random() * width,
      y: -size - Math.random() * height * 0.25,
      size,
      speed: travel / (durationMs * (0.75 + (1 - depth) * 0.35)),
      rotation: (Math.random() - 0.5) * 0.6,
      spin: (Math.random() - 0.5) * 0.0016,
      swayAmp: 8 + Math.random() * 22,
      swayFreq: 0.001 + Math.random() * 0.0015,
      phase: Math.random() * Math.PI * 2,
      blurred: depth < 0.3,
      delay,
    };
  });
}

/**
 * Lluvia de trofeos de platino, estilo el globo del cumpleaños de Twitter.
 *
 * Una capa fija `pointer-events: none` y `aria-hidden`: nunca bloquea un
 * click ni el scroll, y un lector de pantalla no la ve. Es un solo canvas con
 * `requestAnimationFrame` (sin librerías: una lib de confeti pesa más que todo
 * esto y igual habría que darle la forma del trofeo). Dura unos segundos,
 * hace fade out y se desmonta sola con `onDone`.
 *
 * Quien la monta ya decidió que corresponde (efectos activados, sin
 * `prefers-reduced-motion`); igual se vuelve a chequear acá por las dudas.
 */
export default function PlatinumRain({
  intensity,
  onDone,
  className = "fixed inset-0 z-40",
}: {
  intensity: RainIntensity;
  onDone?: () => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Animación imperativa sobre un canvas: efecto del DOM, no estado.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDoneRef.current?.();
      return;
    }

    let frame = 0;
    let cancelled = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    const { durationMs } = CONFIG[intensity];
    const particles = makeParticles(intensity, width, height);

    void loadSprites().then((sprites) => {
      if (cancelled) return;
      const start = performance.now();
      const fadeFrom = durationMs * 0.72;

      const tick = (now: number) => {
        const elapsed = now - start;
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha =
          elapsed < fadeFrom ? 1 : Math.max(0, 1 - (elapsed - fadeFrom) / (durationMs - fadeFrom));

        for (const p of particles) {
          const t = elapsed - p.delay;
          if (t < 0) continue;
          const y = p.y + p.speed * t;
          if (y > height + p.size) continue;
          const x = p.x + Math.sin(t * p.swayFreq + p.phase) * p.swayAmp;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rotation + p.spin * t);
          ctx.drawImage(
            p.blurred ? sprites.blurred : sprites.sharp,
            -p.size / 2,
            -p.size / 2,
            p.size,
            p.size,
          );
          ctx.restore();
        }

        if (elapsed < durationMs) {
          frame = requestAnimationFrame(tick);
        } else {
          ctx.clearRect(0, 0, width, height);
          onDoneRef.current?.();
        }
      };
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="platinum-rain"
      className={`pointer-events-none h-full w-full ${className}`}
    />
  );
}
