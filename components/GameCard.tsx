import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProgressBar } from "./ProgressBar";
import { PlatinumBadge } from "./PlatinumBadge";
import { TrophyTypeIcon, type TrophyType } from "./TrophyTypeIcon";

const TROPHY_TYPES: TrophyType[] = ["platinum", "gold", "silver", "bronze"];

export type GameCardData = {
  id: string;
  name: string;
  platform: string | null;
  imageUrl: string | null;
  total: number;
  obtained: number;
  percent: number;
  counts: Record<TrophyType, number>;
};

export function GameCard({ game, actions }: { game: GameCardData; actions?: ReactNode }) {
  const isPlatinumed = game.counts.platinum > 0;

  return (
    <li className="flex items-center gap-5 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <Link href={`/juegos/${game.id}`} className="shrink-0">
        {game.imageUrl ? (
          <Image
            src={game.imageUrl}
            alt={game.name}
            width={96}
            height={96}
            className="h-24 w-24 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-zinc-800 text-xs text-zinc-500">
            Sin img
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1 space-y-3">
        <Link href={`/juegos/${game.id}`} className="block min-w-0 hover:underline">
          <p className="flex items-center gap-2 truncate text-lg font-medium">
            <span className="truncate">{game.name}</span>
            {isPlatinumed && <PlatinumBadge className="shrink-0" />}
          </p>
          <p className="text-sm text-zinc-500">{game.platform}</p>
        </Link>

        {game.total > 0 ? (
          <>
            <ProgressBar percent={game.percent} />
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span>
                {game.obtained}/{game.total} ({game.percent}%)
              </span>
              <span className="flex items-center gap-3">
                {TROPHY_TYPES.map((type) => (
                  <span key={type} className="flex items-center gap-1">
                    <TrophyTypeIcon type={type} className="h-4 w-4" />
                    {game.counts[type]}
                  </span>
                ))}
              </span>
            </div>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
            Pendiente de sincronizar trofeos
          </span>
        )}
      </div>

      {actions && <div className="shrink-0">{actions}</div>}
    </li>
  );
}
