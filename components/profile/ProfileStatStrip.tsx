import { ProgressBar } from "@/components/ProgressBar";

export type ProfileStat = {
  label: string;
  value: number | string;
  /** Barra fina debajo del número (el % de avance al nivel siguiente de PSN). */
  progressPercent?: number | null;
};

/**
 * Tira de estadísticas del perfil: número grande, etiqueta chica en
 * versalitas, celdas separadas por 1px. Es el patrón prestado de Letterboxd
 * que ya usaba el perfil; vive acá para compartirlo con el perfil de otro
 * usuario en vez de duplicar el markup.
 */
export function ProfileStatStrip({ stats }: { stats: ProfileStat[] }) {
  return (
    <dl
      className="grid gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800"
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="bg-zinc-950 px-3 py-3">
          <dd className="type-stat">{stat.value}</dd>
          <dt className="type-overline mt-1 text-zinc-500">{stat.label}</dt>
          {stat.progressPercent != null && (
            <ProgressBar percent={stat.progressPercent} className="mt-2 h-1" />
          )}
        </div>
      ))}
    </dl>
  );
}
