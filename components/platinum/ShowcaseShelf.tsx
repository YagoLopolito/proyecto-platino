import type { ReactNode } from "react";
import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";
import { TrophyVectorIcon } from "@/components/TrophyTypeIcon";
import { PlatinumSheen } from "./PlatinumSheen";
import { PlatinumTrophy } from "./PlatinumTrophy";
import { SharePlatinumButton } from "./SharePlatinumButton";
import type { NextPlatinumCandidate } from "@/lib/platinum/queries";
import {
  formatEarnedRate,
  formatPlatinumDate,
  type PlatinumPiece,
  type ShowcaseShelfGroup,
} from "@/lib/platinum/stats";

/**
 * Columnas de una repisa. Las celdas van pegadas (sin `gap-x`) para que las
 * repisas de una fila se lean como una sola tabla.
 */
const SHELF_GRID =
  "grid grid-cols-2 gap-y-8 min-[520px]:grid-cols-3 sm:grid-cols-4 sm:gap-y-10 lg:grid-cols-5";

/**
 * El mueble de la colección: cada platino es una pieza de museo -- carátula
 * con marco metálico bajo un spotlight, el trofeo apoyado adelante, la repisa
 * y debajo la placa con número, fecha y rareza.
 *
 * Es un solo mueble aunque la colección vaya por años: el año es una fila
 * divisoria adentro (`col-span-full`), no una caja aparte. Con una caja por
 * año, en escritorio cada una quedaba con dos piezas y medio metro vacío.
 *
 * `rarestGameId` marca la pieza más rara de toda la colección.
 */
export function ShowcaseShelf({
  groups,
  rarestGameId,
  priorityCount = 0,
}: {
  groups: ShowcaseShelfGroup[];
  rarestGameId: string | null;
  /** Cuántas carátulas cargan con prioridad (la primera fila). */
  priorityCount?: number;
}) {
  let index = 0;
  return (
    <ShowcaseCase>
      <ul className={SHELF_GRID}>
        {groups.map((group) => [
          group.year !== null && (
            <li
              key={`year-${group.year}`}
              className="col-span-full -mb-4 flex items-baseline gap-2 px-2.5 pt-4 first:pt-2 sm:px-3"
            >
              <h3 className="type-headline tabular-nums text-ink">{group.year}</h3>
              <span className="type-caption text-ink-faint">
                {group.pieces.length} {group.pieces.length === 1 ? "platino" : "platinos"}
              </span>
              <span aria-hidden="true" className="ml-2 h-px flex-1 self-center bg-border" />
            </li>
          ),
          ...group.pieces.map((piece) => (
            <ShowcasePiece
              key={piece.gameId}
              piece={piece}
              rarest={piece.gameId === rarestGameId}
              priority={index++ < priorityCount}
            />
          )),
        ])}
      </ul>
    </ShowcaseCase>
  );
}

/**
 * Los huecos de "Tu próximo platino", en su propia repisa: los juegos más
 * cerca de platinar, en gris. Sin candidatos queda un hueco solo, "¿Cuál va a
 * ser?": la colección se ve incompleta a propósito.
 */
export function NextPlatinumShelf({ candidates }: { candidates: NextPlatinumCandidate[] }) {
  return (
    <ShowcaseCase muted>
      <ul className={SHELF_GRID}>
        {candidates.length > 0 ? (
          candidates.map((candidate) => <NextSlot key={candidate.gameId} candidate={candidate} />)
        ) : (
          <NextSlot candidate={null} />
        )}
      </ul>
    </ShowcaseCase>
  );
}

/**
 * El mueble: fondo `chrome` (lo único más oscuro que la página) con un vidrio
 * apenas iluminado desde arriba y un canto fino. A ancho completo en mobile,
 * para que la repisa use toda la pantalla.
 */
function ShowcaseCase({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <div
      className={`relative -mx-4 overflow-hidden border-y border-border bg-chrome px-1 pb-6 pt-2 sm:mx-0 sm:rounded-card sm:border sm:px-4 ${
        muted ? "" : "shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_12px_32px_rgb(0_0_0/0.35)]"
      }`}
    >
      {!muted && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-platinum-glow/40 to-transparent"
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/** La repisa: una tabla con canto claro arriba y sombra abajo. */
function Shelf() {
  return (
    <span
      aria-hidden="true"
      className="mt-5 block h-2.5 w-full bg-gradient-to-b from-surface-hover to-chrome shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_8px_16px_rgb(0_0_0/0.45)]"
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

function ShowcasePiece({
  piece,
  rarest,
  priority,
}: {
  piece: PlatinumPiece;
  rarest: boolean;
  priority: boolean;
}) {
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
        <div className="platinum-frame transition group-hover:-translate-y-0.5 group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-accent-ink">
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
        {/* El trofeo apoyado adelante, sobre la esquina: adentro de la
            carátula (`right-0`) y no colgando, que en una repisa de dos
            columnas se metía en la pieza de al lado. */}
        <span className="absolute -bottom-3 right-0 z-[2] translate-x-1/4 drop-shadow-[0_0_10px_var(--platinum-glow)] transition-transform group-hover:scale-110">
          <PlatinumTrophy size={40} />
        </span>
      </Link>
      <Shelf />
      {/* La placa: como la de un museo, alineada a la izquierda. */}
      <div className="mt-2.5 w-full px-2.5 sm:px-3">
        <div className="flex items-center justify-between gap-1">
          <p className="type-overline tabular-nums text-trophy-platinum">#{piece.number}</p>
          <SharePlatinumButton piece={piece} />
        </div>
        <p className="line-clamp-2 type-caption font-medium text-ink">{piece.name}</p>
        <p className="mt-0.5 type-caption tabular-nums text-ink-faint">
          {formatPlatinumDate(piece.unlockedAt)}
          {piece.earnedRate !== null && <> · {formatEarnedRate(piece.earnedRate)}</>}
        </p>
        {rarest && (
          <p className="mt-1 inline-flex items-center gap-1 type-caption font-medium text-rarity-ultra">
            <Icon name="flame" className="h-3 w-3" />
            El más raro
          </p>
        )}
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
      <TrophyVectorIcon type="platinum" className="relative h-12 w-12 opacity-30 grayscale" />
      {candidate && (
        // Lo que falta, como una barra que se llena: el gris se va volviendo
        // platino a medida que avanzás.
        <span className="absolute inset-x-0 bottom-0 h-1 bg-background/70">
          <span
            className="block h-full bg-trophy-platinum"
            style={{ width: `${Math.min(100, Math.max(0, candidate.percent))}%` }}
          />
        </span>
      )}
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
      <div className="mt-2.5 w-full space-y-0.5 px-2.5 sm:px-3">
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
