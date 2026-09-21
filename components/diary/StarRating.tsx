"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/Icon";

const MAX_STARS = 5;

/** Convierte 0-10 (escala de la DB) a 0-5 estrellas (redondeado al medio punto más cercano). */
function toStars(rating: number | null): number {
  if (rating === null) return 0;
  return Math.round(rating) / 2;
}

/**
 * Una estrella: el contorno apagado de base y, encima, la misma forma en oro
 * recortada al ancho que corresponda (0%, 50% o 100%).
 *
 * El recorte va en el contenedor y el ícono de adentro conserva el ancho
 * completo: así la media estrella es exactamente la mitad izquierda de la
 * entera, y no una forma distinta. Antes eran los glifos ★/☆, que cada sistema
 * dibuja con su propio ancho -- las cinco estrellas no alineaban entre
 * dispositivos y el color venía del emoji, no del tema.
 */
function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: string }) {
  return (
    <span className={`relative block ${size}`} aria-hidden="true">
      <Icon name="star" className={`${size} text-ink-faint/40`} />
      {fill > 0 && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: fill === 0.5 ? "50%" : "100%" }}
        >
          <Icon name="star" className={`${size} text-trophy-gold`} />
        </span>
      )}
    </span>
  );
}

function fillFor(stars: number, starIndex: number): 0 | 0.5 | 1 {
  if (stars >= starIndex) return 1;
  if (stars >= starIndex - 0.5) return 0.5;
  return 0;
}

/**
 * Selector de rating en estrellas (0-5, medias estrellas incluidas) que
 * escribe el valor en escala 0-10 (la que usa game_diary_entries.rating) en
 * un input oculto `name="rating"`, para no tocar el schema de la Server Action.
 */
export function StarRatingInput({
  id,
  defaultValue = null,
}: {
  id: string;
  defaultValue?: number | null;
}) {
  const [stars, setStars] = useState(toStars(defaultValue));

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      <input type="hidden" id={id} name="rating" value={stars > 0 ? String(stars * 2) : ""} />
      {Array.from({ length: MAX_STARS }, (_, i) => {
        const starIndex = i + 1;
        const fill = fillFor(stars, starIndex);
        return (
          // Área táctil de 44px en mobile (el glifo solo daba ~24px y era
          // difícil de acertar con el dedo); a partir de `sm` vuelve al tamaño
          // compacto de escritorio.
          <button
            key={starIndex}
            type="button"
            aria-label={`${starIndex} de ${MAX_STARS} estrellas`}
            aria-pressed={fill === 1}
            onClick={() => setStars(stars === starIndex ? starIndex - 0.5 : starIndex)}
            className="flex h-11 w-11 items-center justify-center transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:h-8 sm:w-8"
          >
            <Star fill={fill} size="h-7 w-7 sm:h-6 sm:w-6" />
          </button>
        );
      })}
      {stars > 0 && (
        <button
          type="button"
          onClick={() => setStars(0)}
          className="ml-1 px-2 py-2 type-caption text-ink-faint hover:text-ink"
        >
          Quitar
        </button>
      )}
    </div>
  );
}

/** Muestra un rating (escala 0-10) como estrellas de solo lectura. */
export function StarRatingDisplay({ rating }: { rating: number | null }) {
  if (rating === null) return null;
  const stars = toStars(rating);
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" aria-label={`${rating}/10`}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <Star key={i + 1} fill={fillFor(stars, i + 1)} size="h-3.5 w-3.5" />
      ))}
    </span>
  );
}
