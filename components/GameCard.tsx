import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProgressBar } from "./ProgressBar";
import { PlatinumBadge } from "./PlatinumBadge";
import { CompletionBadge } from "./CompletionBadge";
import { TrophyTypeIcon, PSN_TROPHY_TYPES, type PsnTrophyType } from "./TrophyTypeIcon";
import { formatPlaytime } from "@/lib/playtime";

export type GameCardData = {
  id: string;
  name: string;
  platform: string | null;
  imageUrl: string | null;
  total: number;
  obtained: number;
  percent: number;
  counts: Record<PsnTrophyType, number>;
  /**
   * De dónde salió el juego. Steam no tiene tipos de trofeo ni platino, así
   * que su tarjeta muestra el progreso sin desglose y el badge de 100%.
   */
  source?: string | null;
  /** Minutos jugados (Steam y PSN). NULL/0 = no se muestra nada. */
  playtimeMinutes?: number | null;
};

export function GameCard({ game, actions }: { game: GameCardData; actions?: ReactNode }) {
  const isSteam = game.source === "steam";
  const isPlatinumed = !isSteam && game.counts.platinum > 0;
  const isCompleted = isSteam && game.total > 0 && game.obtained === game.total;
  const playtime = formatPlaytime(game.playtimeMinutes);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:gap-5 sm:p-5">
      <Link href={`/juegos/${game.id}`} className="shrink-0">
        {game.imageUrl ? (
          <Image
            src={game.imageUrl}
            alt={game.name}
            width={96}
            height={96}
            className="h-16 w-16 rounded-lg object-cover sm:h-24 sm:w-24"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-zinc-800 text-xs text-zinc-400 sm:h-24 sm:w-24">
            Sin img
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
        <Link href={`/juegos/${game.id}`} className="block min-w-0 hover:underline">
          <p className="flex items-center gap-2 truncate text-base font-medium sm:text-lg">
            <span className="truncate">{game.name}</span>
            {isPlatinumed && <PlatinumBadge className="shrink-0" />}
            {isCompleted && <CompletionBadge className="shrink-0" />}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-zinc-400">
            <span>{game.platform}</span>
            {playtime && (
              <span className="text-zinc-500" title="Horas jugadas">
                ⏱ {playtime}
              </span>
            )}
          </p>
        </Link>

        {game.total > 0 ? (
          <>
            <ProgressBar percent={game.percent} />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-zinc-400 sm:text-sm">
              <span>
                {game.obtained}/{game.total} ({game.percent}%)
              </span>
              {isSteam ? (
                <span>{game.total} logros</span>
              ) : (
                <span className="flex items-center gap-2 sm:gap-3">
                  {PSN_TROPHY_TYPES.map((type) => (
                    <span key={type} className="flex items-center gap-1">
                      <TrophyTypeIcon type={type} className="h-4 w-4" />
                      {game.counts[type]}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500 px-2 py-0.5 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
            Pendiente de sincronizar trofeos
          </span>
        )}
      </div>

      {actions && <div className="shrink-0">{actions}</div>}
    </li>
  );
}
