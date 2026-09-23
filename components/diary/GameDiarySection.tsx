import Link from "next/link";
import type { GameDiarySummary } from "@/lib/diary/queries";
import { GameScore } from "@/components/diary/GameScore";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { Icon } from "@/components/ui/Icon";

/**
 * Letterbox dentro de la ficha del juego (issue #95): score comunitario con su
 * distribución 1-5, el historial propio del usuario (todas sus rejugadas) y el
 * acceso directo a registrar/editar la partida. No depende de trofeos, así que
 * se ve igual para un juego sincronizado por PSN que para uno de catálogo.
 */
export function GameDiarySection({
  gameId,
  summary,
}: {
  gameId: string;
  summary: GameDiarySummary;
}) {
  const maxBucket = Math.max(1, ...summary.distribution);

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GameScore
            score={{ average_rating: summary.averageRating, rating_count: summary.ratingCount }}
          />
          <Link
            href={`/juegos/${gameId}/diario`}
            className="inline-flex min-h-11 items-center rounded-chip border border-accent-ink bg-accent/15 px-3 type-meta font-medium text-accent-ink transition-colors hover:bg-accent/25 sm:min-h-0 sm:py-1.5"
          >
            {summary.ownEntries.length > 0 ? "Editar mis partidas" : "Marcar como terminado"}
          </Link>
        </div>

        {summary.ratingCount > 0 && (
          <ul className="mt-4 space-y-1">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = summary.distribution[stars - 1];
              return (
                <li key={stars} className="flex items-center gap-2 type-meta text-ink-faint">
                  <span className="flex w-10 shrink-0 items-center gap-1 tabular-nums">
                    {stars}
                    <Icon name="star" className="h-3 w-3 text-trophy-gold" />
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className="h-full bg-trophy-gold"
                      style={{ width: `${Math.round((count / maxBucket) * 100)}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right tabular-nums">{count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {summary.ownEntries.length > 0 ? (
        <ul className="space-y-2">
          {summary.ownEntries.map((entry) => (
            <li key={entry.id} className="border-t border-border py-3 first:border-t-0">
              <div className="flex flex-wrap items-center gap-2 type-meta">
                <span className="text-ink-muted">
                  Partida #{entry.playthroughNumber} · {entry.finishedOn}
                </span>
                <StarRatingDisplay rating={entry.rating} tone="own" />
                {entry.platinumEarnedAt && (
                  <span className="inline-flex items-center gap-1 rounded-chip border border-trophy-platinum/50 bg-trophy-platinum/10 px-1.5 py-0.5 type-caption text-trophy-platinum">
                    <Icon name="trophy" className="h-3 w-3" />
                    Platino {entry.platinumEarnedAt.slice(0, 10)}
                  </span>
                )}
                {entry.completedAt && (
                  <span className="inline-flex items-center gap-1 rounded-chip border border-success/50 bg-success/10 px-1.5 py-0.5 type-caption text-success">
                    <Icon name="completed" className="h-3 w-3" />
                    100% {entry.completedAt.slice(0, 10)}
                  </span>
                )}
                {entry.source === "platinum_sync" && (
                  <span className="type-caption text-ink-faint">creada por el sync de PSN</span>
                )}
                {entry.source === "completion_sync" && (
                  <span className="type-caption text-ink-faint">creada por el sync de Steam</span>
                )}
              </div>
              {/* La reseña va en la serif de lectura: es el contenido, no un metadato. */}
              {entry.review && (
                <p className="mt-1.5 whitespace-pre-line break-words type-review text-ink">
                  {entry.review}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-border p-6 text-center type-body text-ink-muted">
          Todavía no registraste una partida de este juego.
        </p>
      )}
    </div>
  );
}
