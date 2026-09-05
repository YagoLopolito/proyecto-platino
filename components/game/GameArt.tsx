"use client";

import { useState } from "react";
import Image from "next/image";
import type { ReactNode } from "react";

/**
 * `next/image` para arte de juego (carátulas y wallpapers) con fallback si la
 * imagen no carga.
 *
 * Mismo motivo que `FriendAvatar`: las URLs llegan de CDNs de terceros (PSN,
 * RAWG, SteamGridDB, Steam) que fuimos agregando de a uno a
 * `images.remotePatterns`, y además pasan por el optimizador de next/image.
 * Cuando una de esas cosas falla -- un host nuevo que no está whitelisteado,
 * un 404 de la CDN, el optimizador devolviendo error -- el `<img>` quedaba
 * roto y la carátula era un rectángulo vacío. Con el fallback se ve el nombre
 * del juego (o lo que pase el caller), que es lo que hace falta para
 * distinguirlo en una grilla de pósters.
 */
export function GameArt({
  src,
  alt,
  sizes,
  className,
  priority = false,
  quality,
  fallback,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  quality?: number;
  /** Qué mostrar si la imagen no carga. */
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return <>{fallback}</>;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      quality={quality}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
