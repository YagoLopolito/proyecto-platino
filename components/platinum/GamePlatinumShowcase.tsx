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
      {/* Grilla y no flex: en mobile el trofeo va chico al lado del título y
          los datos debajo, a todo el ancho (antes era una columna centrada que
          ocupaba media pantalla antes de la lista de trofeos); desde `sm`, el
          trofeo grande a la izquierda de todo. */}
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-4 rounded-card bg-surface-raised p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-6 sm:p-5">
        <div className="relative flex h-20 w-20 items-center justify-center sm:row-span-3 sm:h-36 sm:w-36">
          <span
            aria-hidden="true"
            className="platinum-pulse absolute inset-2 rounded-full bg-platinum-glow blur-2xl sm:inset-3"
          />
          <PlatinumSheen className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
            <PlatinumTrophy
              size={112}
              label="Trofeo de platino"
              priority
              className="h-[4.5rem] w-[4.5rem] sm:h-28 sm:w-28"
            />
          </PlatinumSheen>
        </div>

        <div className="min-w-0">
          <p id="game-platinum-heading" className="type-overline text-trophy-platinum">
            Platino conseguido
          </p>
          <p className="type-title text-ink">
            Tu platino <span className="tabular-nums">#{piece.number}</span>
          </p>
        </div>

        <dl className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3 sm:col-span-1 sm:col-start-2 sm:gap-x-6 sm:border-t-0 sm:pt-0">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="type-overline text-ink-faint">{fact.label}</dt>
              <dd className="truncate type-meta text-ink" title={fact.value}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="col-span-2 sm:col-span-1 sm:col-start-2">
          <GamePlatinumActions piece={piece} />
        </div>
      </div>
    </section>
  );
}
