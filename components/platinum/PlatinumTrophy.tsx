"use client";

import { useState } from "react";
import Image from "next/image";
import { TrophyVectorIcon } from "@/components/TrophyTypeIcon";
import {
  PLATINUM_TROPHY_FALLBACK_SRC,
  PLATINUM_TROPHY_SRC,
  isPlatinumAssetMissing,
  warnMissingPlatinumAsset,
} from "@/lib/platinum/assets";

const SOURCES = [PLATINUM_TROPHY_SRC, PLATINUM_TROPHY_FALLBACK_SRC] as const;

/**
 * El trofeo de platino como imagen: el ícono oficial si está en `public/`, si
 * no el trofeo que ya usa Actividad y, si tampoco carga, la copa vectorial del
 * set. Nunca deja un rectángulo vacío.
 *
 * Sin `label` es decorativo (`alt=""`): casi siempre va al lado de un texto
 * que ya dice "platino".
 */
export function PlatinumTrophy({
  size,
  label,
  className = "",
  priority = false,
}: {
  /** Lado en px (es cuadrado). */
  size: number;
  label?: string;
  className?: string;
  priority?: boolean;
}) {
  // Si el oficial ya falló en otra instancia, se arranca por el fallback: una
  // biblioteca con decenas de platinos no hace decenas de pedidos que dan 404.
  const [index, setIndex] = useState(() => (isPlatinumAssetMissing(PLATINUM_TROPHY_SRC) ? 1 : 0));

  if (index >= SOURCES.length) {
    return (
      <span
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className={`inline-flex shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        <TrophyVectorIcon type="platinum" className="h-full w-full" />
      </span>
    );
  }

  const src = SOURCES[index];
  return (
    <Image
      src={src}
      alt={label ?? ""}
      width={size}
      height={size}
      priority={priority}
      // Mismo criterio que `GameArt`: nada pasa por el optimizador de Vercel.
      unoptimized
      draggable={false}
      className={`shrink-0 select-none object-contain ${className}`}
      onError={() => {
        warnMissingPlatinumAsset(src);
        setIndex((current) => current + 1);
      }}
    />
  );
}
