import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";
import { PlatinumSheen } from "@/components/platinum/PlatinumSheen";
import { PlatinumTrophy } from "@/components/platinum/PlatinumTrophy";
import type { ReactNode } from "react";

export type PosterProgress = {
  obtained: number;
  total: number;
  percent: number;
};

/**
 * Carátula de un juego, la unidad visual de toda la app (estilo Letterbox:
 * las pantallas de navegar son grillas de pósters, no listas con texto).
 *
 * Sobre la carátula sólo va lo mínimo para no perder el vistazo rápido que sí
 * necesita un tracker de trofeos: una barra de progreso finita abajo y el
 * badge de platino / 100% en una esquina. El número exacto y el desglose por
 * tipo viven en la ficha del juego.
 *
 * `aspect-[3/4]` y no el 2:3 de un póster de cine: las carátulas llegan de
 * fuentes muy distintas (los íconos de PSN son cuadrados, las de RAWG
 * apaisadas) y a 2:3 el recorte de `object-cover` se comía media imagen.
 *
 * Un juego platinado (PSN) es la excepción a "lo mínimo": es el logro máximo
 * de la app y tiene que verse de lejos. Lleva marco metálico con halo, el
 * reflejo de luz que cruza cada tanto (`PlatinumSheen`, pausado fuera de
 * pantalla y apagado con `prefers-reduced-motion`) y el trofeo de platino en
 * la esquina.
 */
export function GamePoster({
  href,
  name,
  imageUrl,
  progress,
  isPlatinum = false,
  isCompleted = false,
  overlay,
  caption,
  showName = false,
  sizes = "(max-width: 480px) 31vw, (max-width: 640px) 23vw, (max-width: 1024px) 19vw, 160px",
  priority = false,
}: {
  href: string;
  name: string;
  imageUrl: string | null;
  /** Progreso de trofeos/logros. `null` en juegos de catálogo (no tienen). */
  progress?: PosterProgress | null;
  isPlatinum?: boolean;
  isCompleted?: boolean;
  /** Franja sobre el borde inferior de la carátula (ej. el avatar del amigo). */
  overlay?: ReactNode;
  /** Línea de datos debajo de la carátula (ej. rating y fecha). */
  caption?: ReactNode;
  /** Muestra el nombre debajo. Off por defecto: la carátula ya lo dice. */
  showName?: boolean;
  sizes?: string;
  priority?: boolean;
}) {
  const hasProgress = progress != null && progress.total > 0;

  const cover = (
    <>
      {imageUrl ? (
        <GameArt
          src={imageUrl}
          alt={name}
          sizes={sizes}
          priority={priority}
          className="object-cover"
          fallback={<PosterPlaceholder name={name} showName={showName} />}
        />
      ) : (
        <PosterPlaceholder name={name} showName={showName} />
      )}

      {isPlatinum ? (
        <span className="absolute right-1 top-1 z-[2] flex drop-shadow-[0_0_6px_var(--platinum-glow)]">
          <PlatinumTrophy size={26} label="Platino" />
        </span>
      ) : (
        isCompleted && (
          // El 💯 que había acá era el ejemplo de manual del problema del emoji
          // (issue #176 §3.3): ahora es un ícono del set, en el verde de
          // `success`. El 100% de Steam no es un platino y no lleva el
          // tratamiento de platino (ver CLAUDE.md, sección de Steam).
          <span
            className="absolute right-1 top-1 z-[2] flex h-5 w-5 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm"
            title="100% de logros"
          >
            <Icon name="completed" className="h-3 w-3 text-success" label="100% de logros" />
          </span>
        )
      )}

      {overlay}

      {hasProgress && (
        <div
          className="absolute inset-x-0 bottom-0 z-[2] h-[3px] bg-background/70"
          role="img"
          aria-label={`${progress.percent}% completado, ${progress.obtained} de ${progress.total}`}
        >
          <div
            className={`h-full ${isPlatinum || isCompleted ? "bg-trophy-gold" : "bg-accent"}`}
            style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
          />
        </div>
      )}
    </>
  );

  return (
    <Link href={href} className="group block" title={name}>
      {isPlatinum ? (
        <div
          className="platinum-frame transition group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-accent-ink"
          data-platinum=""
        >
          <PlatinumSheen
            className="relative aspect-[3/4] w-full overflow-hidden rounded-card bg-surface"
            delaySeconds={sheenDelay(name)}
          >
            {cover}
          </PlatinumSheen>
        </div>
      ) : (
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-card border border-border bg-surface transition group-hover:border-border-strong group-focus-visible:border-accent-ink">
          {cover}
        </div>
      )}

      {showName && <p className="mt-1.5 line-clamp-2 type-caption text-ink">{name}</p>}
      {caption && <div className="mt-1 type-caption text-ink-muted">{caption}</div>}
    </Link>
  );
}

/**
 * Desfase del reflejo, estable por juego: si todas las carátulas de la grilla
 * brillaran a la vez se leería como un parpadeo, no como un reflejo.
 */
function sheenDelay(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 1 + (hash % 60) / 10;
}

/**
 * Marco sin carátula: o porque el juego no tiene imagen, o porque la que tenía
 * no cargó (ver `GameArt`).
 */
function PosterPlaceholder({ name, showName }: { name: string; showName: boolean }) {
  // Con el nombre debajo, repetirlo adentro del marco lo mostraba dos veces
  // seguidas: queda sólo un glifo neutro de "sin carátula". Sin nombre debajo,
  // el nombre hace de portada: en una grilla de pósters es lo único que la
  // distingue.
  return showName ? (
    <span className="flex h-full w-full items-center justify-center text-border-strong">
      <Icon name="gamepad" className="h-8 w-8" />
    </span>
  ) : (
    <span className="flex h-full w-full items-center justify-center p-2 text-center type-caption text-ink-muted">
      {name}
    </span>
  );
}
