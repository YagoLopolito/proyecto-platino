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
    <li className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <Link href={`/juegos/${game.id}`} className="shrink-0">
        {game.imageUrl ? (
          <Image
            src={game.imageUrl}
            alt={game.name}
            width={56}
            height={56}
            unoptimized
            className="h-14 w-14 rounded object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded bg-zinc-800 text-xs text-zinc-500">
            Sin img
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1 space-y-2">
        <Link href={`/juegos/${game.id}`} className="block min-w-0 hover:underline">
          <p className="flex items-center gap-2 truncate font-medium">
            <span className="truncate">{game.name}</span>
            {isPlatinumed && <PlatinumBadge className="shrink-0" />}
          </p>
          <p className="text-xs text-zinc-500">{game.platform}</p>
        </Link>

        {game.total > 0 ? (
          <>
            <ProgressBar percent={game.percent} />
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                {game.obtained}/{game.total} ({game.percent}%)
              </span>
              <span className="flex items-center gap-2">
                {TROPHY_TYPES.map((type) => (
                  <span key={type} className="flex items-center gap-0.5">
                    <TrophyTypeIcon type={type} className="h-3.5 w-3.5" />
                    {game.counts[type]}
                  </span>
                ))}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-zinc-500">Sin trofeos cargados todavía.</p>
        )}
      </div>

      {actions && <div className="shrink-0">{actions}</div>}
    </li>
  );
}
