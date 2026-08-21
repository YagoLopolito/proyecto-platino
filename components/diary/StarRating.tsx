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
          <button
            key={starIndex}
            type="button"
            aria-label={`${starIndex} de ${MAX_STARS} estrellas`}
            aria-pressed={filled}
            onClick={() => setStars(stars === starIndex ? starIndex - 0.5 : starIndex)}
            className="relative text-2xl leading-none text-zinc-700 hover:scale-110 transition-transform"
          >
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
          </button>
        );
      })}
      {stars > 0 && (
        <button
          type="button"
          onClick={() => setStars(0)}
          className="ml-1 text-xs text-zinc-500 hover:text-zinc-300"
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
