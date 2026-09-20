import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";
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

  return (
    <Link href={href} className="group block" title={name}>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-card border border-border bg-surface transition group-hover:border-border-strong group-focus-visible:border-accent-ink">
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

        {(isPlatinum || isCompleted) && (
          // El 🏆/💯 que había acá era el ejemplo de manual del problema del
          // emoji (issue #176 §3.3): se dibujaba distinto en cada sistema
          // operativo, traía su propio color y quedaba como una calcomanía
          // pegada sobre la carátula. Ahora es un ícono del set, con el color
          // canónico de cada cosa: el celeste del trofeo platino, el verde de
          // `success` para el 100%.
          <span
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm"
            title={isPlatinum ? "Platino" : "100% de logros"}
          >
            <Icon
              name={isPlatinum ? "trophy" : "completed"}
              className={`h-3 w-3 ${isPlatinum ? "text-trophy-platinum" : "text-success"}`}
              label={isPlatinum ? "Platino" : "100% de logros"}
            />
          </span>
        )}

        {overlay}

        {hasProgress && (
          <div
            className="absolute inset-x-0 bottom-0 h-[3px] bg-background/70"
            role="img"
            aria-label={`${progress.percent}% completado, ${progress.obtained} de ${progress.total}`}
          >
            <div
              className={`h-full ${isPlatinum || isCompleted ? "bg-trophy-gold" : "bg-accent"}`}
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        )}
      </div>

      {showName && <p className="mt-1.5 line-clamp-2 type-caption text-ink">{name}</p>}
      {caption && <div className="mt-1 type-caption text-ink-muted">{caption}</div>}
    </Link>
  );
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
