import Link from "next/link";
import type { GameDiarySummary } from "@/lib/diary/queries";
import { GameScore } from "@/components/diary/GameScore";
import { StarRatingDisplay } from "@/components/diary/StarRating";

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
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GameScore
            score={{ average_rating: summary.averageRating, rating_count: summary.ratingCount }}
          />
          <Link
            href={`/juegos/${gameId}/diario`}
            className="rounded border border-blue-700 bg-blue-900/30 px-3 py-1.5 text-sm text-blue-300 hover:border-blue-500"
          >
            {summary.ownEntries.length > 0 ? "Editar mis partidas" : "Marcar como terminado"}
          </Link>
        </div>

        {summary.ratingCount > 0 && (
          <ul className="mt-4 space-y-1">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = summary.distribution[stars - 1];
              return (
                <li key={stars} className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="w-10 shrink-0 tabular-nums">{stars} ★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full bg-[var(--color-trophy-gold)]"
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
            <li
              key={entry.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-zinc-400">
                  Partida #{entry.playthroughNumber} · {entry.finishedOn}
                </span>
                <StarRatingDisplay rating={entry.rating} />
                {entry.platinumEarnedAt && (
                  <span className="rounded-full border border-zinc-600/60 bg-zinc-700/20 px-1.5 py-0.5 text-[11px] text-zinc-300">
                    🏆 Platino {entry.platinumEarnedAt.slice(0, 10)}
                  </span>
                )}
                {entry.source === "platinum_sync" && (
                  <span className="text-[11px] text-zinc-500">creada por el sync de PSN</span>
                )}
              </div>
              {entry.review && <p className="mt-1 text-xs text-zinc-500">{entry.review}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
          Todavía no registraste una partida de este juego.
        </p>
      )}
    </div>
  );
}
