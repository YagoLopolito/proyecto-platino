"use client";

import { useState } from "react";

const MAX_STARS = 5;

/** Convierte 0-10 (escala de la DB) a 0-5 estrellas (redondeado al medio punto más cercano). */
function toStars(rating: number | null): number {
  if (rating === null) return 0;
  return Math.round(rating) / 2;
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
        const filled = stars >= starIndex;
        const halfFilled = !filled && stars >= starIndex - 0.5;
        return (
          // Área táctil de ~40px en mobile (el glifo solo daba ~24px y era
          // difícil de acertar con el dedo); a partir de `sm` vuelve al tamaño
          // compacto de escritorio.
          <button
            key={starIndex}
            type="button"
            aria-label={`${starIndex} de ${MAX_STARS} estrellas`}
            aria-pressed={filled}
            onClick={() => setStars(stars === starIndex ? starIndex - 0.5 : starIndex)}
            className="relative flex h-10 w-10 items-center justify-center text-3xl leading-none text-zinc-700 transition-transform hover:scale-110 sm:h-8 sm:w-8 sm:text-2xl"
          >
            <span aria-hidden="true">☆</span>
            {(filled || halfFilled) && (
              // El recorte de la media estrella va en el contenedor; el glifo de
              // adentro conserva el ancho completo del botón para quedar
              // exactamente encima del ☆ de base (que está centrado).
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden text-[var(--color-trophy-gold)]"
                style={{ width: halfFilled ? "50%" : "100%" }}
              >
                <span className="flex h-full w-10 items-center justify-center sm:w-8">★</span>
              </span>
            )}
          </button>
        );
      })}
      {stars > 0 && (
        <button
          type="button"
          onClick={() => setStars(0)}
          className="ml-1 px-2 py-2 text-xs text-zinc-500 hover:text-zinc-300"
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
      {Array.from({ length: MAX_STARS }, (_, i) => {
        const starIndex = i + 1;
        const filled = stars >= starIndex;
        const halfFilled = !filled && stars >= starIndex - 0.5;
        return (
          <span key={starIndex} className="relative text-sm leading-none text-zinc-700">
            <span aria-hidden="true">☆</span>
            {(filled || halfFilled) && (
              <span
                aria-hidden="true"
                className="absolute inset-0 overflow-hidden text-[var(--color-trophy-gold)]"
                style={{ width: halfFilled ? "50%" : "100%" }}
              >
                ★
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
