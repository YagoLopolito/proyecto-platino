import Image from "next/image";
import Link from "next/link";
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
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 transition group-hover:border-zinc-500 group-focus-visible:border-blue-500">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes={sizes}
            priority={priority}
            className="object-cover"
          />
        ) : (
          // Sin carátula, el nombre hace de portada en vez de un "Sin img"
          // genérico: en una grilla de pósters es lo único que la distingue.
          <span className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] leading-tight text-zinc-500">
            {name}
          </span>
        )}

        {(isPlatinum || isCompleted) && (
          <span
            className="absolute right-1 top-1 rounded-full bg-zinc-950/80 px-1.5 py-0.5 text-[10px] leading-none backdrop-blur-sm"
            title={isPlatinum ? "Platino" : "100% de logros"}
          >
            <span aria-hidden="true">{isPlatinum ? "🏆" : "💯"}</span>
            <span className="sr-only">{isPlatinum ? "Platino" : "100% de logros"}</span>
          </span>
        )}

        {overlay}

        {hasProgress && (
          <div
            className="absolute inset-x-0 bottom-0 h-[3px] bg-zinc-950/70"
            role="img"
            aria-label={`${progress.percent}% completado, ${progress.obtained} de ${progress.total}`}
          >
            <div
              className={`h-full ${isPlatinum || isCompleted ? "bg-[var(--color-trophy-gold)]" : "bg-accent"}`}
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        )}
      </div>

      {showName && (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-zinc-300">{name}</p>
      )}
      {caption && <div className="mt-1 text-[11px] text-zinc-500">{caption}</div>}
    </Link>
  );
}
