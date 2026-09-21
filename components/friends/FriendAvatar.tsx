"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Avatar de PSN del usuario, con la inicial del nombre como placeholder cuando
 * la cuenta no tiene avatar o la imagen no carga. El fallback por error
 * importa porque PSN sirve los avatares desde varios hosts (y por http): si
 * aparece uno nuevo que no está en `images.remotePatterns` de next.config,
 * next/image lo rechaza -- así queda un círculo con la inicial en vez de una
 * imagen rota.
 */
export function FriendAvatar({
  url,
  name,
  size = 32,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
        className="flex shrink-0 items-center justify-center rounded-full bg-surface-hover font-medium text-ink-muted"
        aria-hidden="true"
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      // Ya vienen a 32-64px de la CDN de PSN: optimizarlos no gana nada y
      // gasta la cuota de transformaciones de Vercel (ver GameArt).
      unoptimized
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-surface-hover object-cover"
    />
  );
}
