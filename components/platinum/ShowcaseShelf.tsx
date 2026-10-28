import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import { TrophyTypeIcon } from "@/components/TrophyTypeIcon";
import { PlatinumSheen } from "./PlatinumSheen";
import { PlatinumTrophy } from "./PlatinumTrophy";
import { SharePlatinumButton } from "./SharePlatinumButton";
import type { NextPlatinumCandidate } from "@/lib/platinum/queries";
import { formatEarnedRate, formatPlatinumDate, type PlatinumPiece } from "@/lib/platinum/stats";

/**
 * Las repisas de la vitrina: cada platino es una pieza de museo -- carátula
 * con marco metálico bajo un spotlight, el trofeo apoyado adelante, la repisa
 * y debajo la placa con número, fecha y rareza.
 *
 * Las celdas van pegadas (`gap-x-0`) para que las repisas de una fila se lean
 * como una sola tabla. Al final, los huecos de "Tu próximo platino" con los
 * juegos más cerca de platinar: la colección se ve incompleta a propósito.
 */
export function ShowcaseShelf({
  pieces,
  next,
  emptySlots,
}: {
  pieces: PlatinumPiece[];
  next: NextPlatinumCandidate[];
  /** Huecos sin sugerencia, para cerrar la repisa. */
  emptySlots: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-y-10 min-[520px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5">
      {pieces.map((piece, index) => (
        <ShowcasePiece key={piece.gameId} piece={piece} priority={index < 4} />
      ))}
      {next.map((candidate) => (
        <NextSlot key={candidate.gameId} candidate={candidate} />
      ))}
      {Array.from({ length: emptySlots }, (_, index) => (
        <NextSlot key={`empty-${index}`} candidate={null} />
      ))}
    </ul>
  );
}

/** Spotlight + repisa: lo común a una pieza y a un hueco. */
function Shelf() {
  return (
    <span
      aria-hidden="true"
      className="mt-5 block h-2.5 w-full bg-gradient-to-b from-surface-hover to-chrome shadow-[0_8px_16px_rgb(0_0_0/0.45)]"
    />
  );
}

function Spotlight() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-2 top-0 h-[85%] bg-[radial-gradient(ellipse_at_top,var(--platinum-glow),transparent_70%)]"
    />
  );
}

function ShowcasePiece({ piece, priority }: { piece: PlatinumPiece; priority: boolean }) {
  return (
    <li
      id={`platino-${piece.gameId}`}
      data-testid="platinum-game"
      className="relative flex scroll-mt-24 flex-col items-center pt-6"
    >
      <Spotlight />
      <Link
        href={`/juegos/${piece.gameId}`}
        className="group relative block w-[72%] max-w-[9rem] focus:outline-none"
      >
        <div className="platinum-frame transition group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-accent-ink">
          <PlatinumSheen
            className="relative aspect-[3/4] w-full overflow-hidden rounded-card bg-surface"
            delaySeconds={1 + (piece.number % 7)}
          >
            {piece.imageUrl ? (
              <GameArt
                src={piece.imageUrl}
                alt={piece.name}
                sizes="144px"
                priority={priority}
                className="object-cover"
                fallback={<CoverName name={piece.name} />}
              />
            ) : (
              <CoverName name={piece.name} />
            )}
          </PlatinumSheen>
        </div>
        <span className="absolute -bottom-4 -right-4 z-[2] drop-shadow-[0_0_10px_var(--platinum-glow)] transition-transform group-hover:scale-110">
          <PlatinumTrophy size={44} />
        </span>
      </Link>
      <Shelf />
      <div className="mt-3 w-full space-y-0.5 px-2 text-center">
        <p className="type-overline text-trophy-platinum">
          <span className="tabular-nums">#{piece.number}</span>
        </p>
        <p className="line-clamp-2 type-caption font-medium text-ink">{piece.name}</p>
        <p className="type-caption text-ink-faint">
          {formatPlatinumDate(piece.unlockedAt)}
          {piece.earnedRate !== null && <> · {formatEarnedRate(piece.earnedRate)}</>}
        </p>
        <div className="flex justify-center">
          <SharePlatinumButton piece={piece} />
        </div>
      </div>
    </li>
  );
}

function NextSlot({ candidate }: { candidate: NextPlatinumCandidate | null }) {
  const silhouette = (
    <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-card border border-dashed border-border-strong bg-surface/40">
      {candidate?.imageUrl && (
        <GameArt
          src={candidate.imageUrl}
          alt=""
          sizes="144px"
          className="object-cover opacity-25 grayscale"
          fallback={null}
        />
      )}
      <TrophyTypeIcon type="platinum" className="relative h-12 w-12 opacity-30 grayscale" />
    </div>
  );

  return (
    <li data-testid="next-platinum-slot" className="relative flex flex-col items-center pt-6">
      {candidate ? (
        <Link
          href={`/juegos/${candidate.gameId}`}
          className="block w-[72%] max-w-[9rem] rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          aria-label={`Tu próximo platino: ${candidate.name}, ${candidate.percent}%`}
        >
          {silhouette}
        </Link>
      ) : (
        <div className="w-[72%] max-w-[9rem]">{silhouette}</div>
      )}
      <Shelf />
      <div className="mt-3 w-full space-y-0.5 px-2 text-center">
        <p className="type-overline text-ink-faint">Tu próximo platino</p>
        {candidate ? (
          <>
            <p className="line-clamp-2 type-caption text-ink-muted">{candidate.name}</p>
            <p className="type-caption tabular-nums text-trophy-platinum">
              {candidate.percent}% · a un paso
            </p>
          </>
        ) : (
          <p className="type-caption text-ink-faint">¿Cuál va a ser?</p>
        )}
      </div>
    </li>
  );
}

function CoverName({ name }: { name: string }) {
  return (
    <span className="flex h-full w-full items-center justify-center p-2 text-center type-caption text-ink-muted">
      {name}
    </span>
  );
}
