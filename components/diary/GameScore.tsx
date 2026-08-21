import { StarRatingDisplay } from "@/components/diary/StarRating";

/**
 * Con menos de esta cantidad de valoraciones no se muestra el promedio: un
 * solo voto no debería definir el score de un juego (issue #92).
 */
export const MIN_RATINGS_FOR_AVERAGE = 3;

export interface GameScoreData {
  average_rating: number | null;
  rating_count: number | null;
}

/** Score comunitario de un juego (vista `game_scores`). */
export function GameScore({
  score,
  className = "",
}: {
  score: GameScoreData | null;
  className?: string;
}) {
  const count = score?.rating_count ?? 0;
  const average = score?.average_rating ?? null;

  if (count < MIN_RATINGS_FOR_AVERAGE || average === null) {
    return (
      <span className={`text-sm text-zinc-500 ${className}`}>
        Todavía sin suficientes valoraciones
        {count > 0 && ` (${count} ${count === 1 ? "voto" : "votos"})`}.
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-sm text-zinc-400 ${className}`}>
      <StarRatingDisplay rating={average} />
      <span>
        {(average / 2).toFixed(1)}/5 · {count} valoraciones
      </span>
    </span>
  );
}
