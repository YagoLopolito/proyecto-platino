"use client";

import { useState } from "react";
import Image from "next/image";
import type { ReactNode } from "react";

/**
 * `next/image` para arte de juego (carátulas, wallpapers e íconos de trofeo)
 * con dos diferencias respecto de usar `next/image` a pelo.
 *
 * 1. **No pasa por el optimizador de Vercel** (`unoptimized`). El plan Hobby
 *    incluye 5.000 transformaciones por mes y esta app las quema en días: una
 *    biblioteca real son cientos de carátulas, cada una en varios tamaños, más
 *    un ícono por trofeo (son más de 10.000). Cuando la cuota se agota, Vercel
 *    deja de servir `/_next/image` y **todas** las imágenes desaparecen de
 *    golpe -- que es exactamente lo que pasó. Además no ganábamos casi nada:
 *    lo que servimos ya son JPG/PNG comprimidos de las CDNs de RAWG, Steam y
 *    PSN, pensados justamente para mostrarse a este tamaño. Las fotos que
 *    suben los usuarios (Galería online) también van por acá: el feed y la
 *    grilla muestran un derivado liviano que se genera en el navegador al
 *    subir, así que tampoco necesitan el optimizador.
 * 2. **Fallback si la imagen no carga**, igual que `FriendAvatar`: un host
 *    nuevo fuera de `images.remotePatterns`, un 404 de la CDN. Antes quedaba
 *    un rectángulo vacío; ahora se ve el nombre del juego o el placeholder que
 *    pase el caller.
 */
export function GameArt({
  src,
  alt,
  sizes,
  width,
  height,
  className,
  priority = false,
  fallback,
}: {
  src: string;
  alt: string;
  /** Sólo para el modo `fill` (sin `width`/`height`). */
  sizes?: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  /** Qué mostrar si la imagen no carga. */
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return <>{fallback}</>;

  // `alt` va explícito en cada <Image> y no acá: dentro del spread, la regla
  // jsx-a11y/alt-text no lo ve y avisa igual.
  const common = {
    src,
    priority,
    className,
    // Ver el punto 1 del comentario de arriba.
    unoptimized: true,
    onError: () => setFailed(true),
  };

  return width !== undefined && height !== undefined ? (
    <Image {...common} alt={alt} width={width} height={height} />
  ) : (
    <Image {...common} alt={alt} fill sizes={sizes} />
  );
}
