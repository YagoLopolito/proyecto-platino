import { formatPlaytime } from "@/lib/playtime";
import { Icon } from "@/components/ui/Icon";
import type { GameCardData } from "@/lib/catalog/details";

/**
 * Tiempos estimados del juego, al estilo HowLongToBeat: cuánto lleva pasarse
 * la historia y cuánto llegar al 100%.
 *
 * Va en las dos fichas (la de trofeos y la del diario) para que el dato no
 * dependa de por dónde entró el usuario. Son estimaciones de la comunidad,
 * no del usuario: se distinguen de las horas jugadas propias porque citan la
 * fuente y dicen "estimado".
 *
 * No renderiza nada si no hay ningún dato -- la ficha no muestra un hueco con
 * guiones para los juegos que ninguna fuente conoce.
 */
export function TimeToBeat({
  beatMinutes,
  completeMinutes,
  source,
  hasPlatinum = false,
}: {
  beatMinutes: number | null;
  completeMinutes: number | null;
  source: string | null;
  /**
   * Si el juego tiene platino (PSN), el tiempo de completarlo se muestra como
   * "Platino": IGDB no publica un tiempo de platino -- nadie lo hace -- pero
   * su `completely` es el 100% de completitud, que es justamente lo que
   * destraba el platino en la enorme mayoría de los juegos. En Steam, que no
   * tiene platino, la etiqueta se queda en "Al 100%".
   */
  hasPlatinum?: boolean;
}) {
  const beat = formatPlaytime(beatMinutes);
  const complete = formatPlaytime(completeMinutes);
  if (!beat && !complete) return null;

  return (
    <div className="space-y-1" data-testid="time-to-beat">
      <dl className="flex flex-wrap gap-2">
        {beat && <Estimate label="Pasarlo" value={beat} />}
        {complete && <Estimate label={hasPlatinum ? "Platino" : "Al 100%"} value={complete} />}
      </dl>
      <p className="flex items-center gap-1 type-caption text-ink-faint">{sourceLabel(source)}</p>
    </div>
  );
}

function Estimate({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-baseline gap-1.5 rounded-chip border border-border bg-surface px-2.5 py-1">
      <dt className="type-overline text-ink-faint">{label}</dt>
      <dd className="type-meta font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/**
 * Citar la fuente no es decorativo: un agregado de miles de partidas reales
 * (IGDB) y la estimación de un modelo no valen lo mismo, y el usuario tiene
 * que poder distinguirlas de un vistazo.
 */
function sourceLabel(source: string | null) {
  if (source === "ai") {
    return (
      <>
        <Icon name="sparkle" className="h-3 w-3 shrink-0" />
        Tiempo estimado por IA: puede tener errores.
      </>
    );
  }
  return "Tiempo estimado por la comunidad (IGDB).";
}

/** Las props que las dos fichas sacan de `GameCardData`, sin repetir el mapeo. */
export function timeToBeatProps(game: GameCardData) {
  return {
    beatMinutes: game.timeToBeatMinutes,
    completeMinutes: game.timeToCompleteMinutes,
    source: game.timeEstimatesSource,
  };
}
