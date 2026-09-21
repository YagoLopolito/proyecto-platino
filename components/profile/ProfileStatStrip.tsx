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
 *
 * El 1px entre celdas es el fondo del contenedor (`bg-border`) asomando por el
 * `gap-px`: no hay bordes por celda que se dupliquen en las esquinas.
 */
export function ProfileStatStrip({ stats }: { stats: ProfileStat[] }) {
  return (
    <dl
      className="grid gap-px overflow-hidden rounded-card border border-border bg-border"
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="bg-surface px-3 py-3">
          <dd className="type-stat text-ink">{stat.value}</dd>
          <dt className="type-overline mt-1 text-ink-faint">{stat.label}</dt>
          {stat.progressPercent != null && (
            <ProgressBar percent={stat.progressPercent} className="mt-2 h-1" />
          )}
        </div>
      ))}
    </dl>
  );
}
