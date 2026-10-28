import { PlatinumSheen } from "./PlatinumSheen";
import { PlatinumTrophy } from "./PlatinumTrophy";
import { GamePlatinumActions } from "./GamePlatinumActions";
import type { GamePlatinumSummary } from "@/lib/game-page/data";
import { formatDaysToPlatinum, formatEarnedRate, formatPlatinumDate } from "@/lib/platinum/stats";

/**
 * El platino de un juego, en su ficha: el trofeo grande con halo que respira y
 * reflejo metálico, y al lado la "ficha del platino" -- número en tu
 * colección, fecha, rareza en PSN, cuánto tardaste y tu trofeo más raro del
 * juego. Va entre el hero y las tabs, así se ve en las cuatro.
 *
 * La lluvia, el sonido, "¡Otra vez!" y "Compartir" son la única parte
 * interactiva (`GamePlatinumActions`).
 */
export function GamePlatinumShowcase({ summary }: { summary: GamePlatinumSummary }) {
  const { piece, days, rarest } = summary;

  const facts: { label: string; value: string }[] = [
    { label: "Platinado el", value: formatPlatinumDate(piece.unlockedAt) },
    ...(piece.earnedRate !== null
      ? [{ label: "Lo tiene el", value: `${formatEarnedRate(piece.earnedRate)} de PSN` }]
      : []),
    ...(days !== null ? [{ label: "Lo sacaste", value: formatDaysToPlatinum(days) }] : []),
    ...(rarest
      ? [
          {
            label: "Tu trofeo más raro",
            value: `${rarest.name} (${formatEarnedRate(rarest.earnedRate)})`,
          },
        ]
      : []),
  ];

  return (
    <section
      aria-labelledby="game-platinum-heading"
      data-testid="game-platinum"
      className="platinum-frame mt-6"
    >
      <div className="flex flex-col items-center gap-5 rounded-card bg-surface-raised p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <div className="relative flex h-32 w-32 shrink-0 items-center justify-center sm:h-36 sm:w-36">
          <span
            aria-hidden="true"
            className="platinum-pulse absolute inset-3 rounded-full bg-platinum-glow blur-2xl"
          />
          <PlatinumSheen className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
            <PlatinumTrophy size={112} label="Trofeo de platino" priority />
          </PlatinumSheen>
        </div>

        <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
          <div>
            <p id="game-platinum-heading" className="type-overline text-trophy-platinum">
              Platino conseguido
            </p>
            <p className="type-title text-ink">
              Tu platino <span className="tabular-nums">#{piece.number}</span>
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 min-[420px]:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="type-overline text-ink-faint">{fact.label}</dt>
                <dd className="truncate type-meta text-ink" title={fact.value}>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          <GamePlatinumActions piece={piece} />
        </div>
      </div>
    </section>
  );
}
