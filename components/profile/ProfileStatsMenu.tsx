import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/SectionHeader";

export interface ProfileStatRow {
  label: string;
  /** Sin `href` la fila es sólo un dato (en el perfil ajeno no todo tiene expandido). */
  href?: string;
  /** Aclaración chica debajo de la etiqueta ("según su diario"). */
  note?: string;
  /** Número principal. `null` en filas sin número (Resumen del año). */
  value?: number | null;
  /** Segundo número, "este año". */
  thisYear?: number;
}

/**
 * "Estadísticas" del perfil (issue #196): filas tipo menú con el número a la
 * derecha y un chevron, como la pantalla de perfil de Letterboxd. Cada fila es
 * un link a su expandido. Los números por plataforma van en filas separadas
 * (Platinos / 100% en Steam): no se suman.
 */
export function ProfileStatsMenu({ rows }: { rows: ProfileStatRow[] }) {
  return (
    <section className="space-y-3" aria-labelledby="profile-stats-heading">
      <SectionHeader title={<span id="profile-stats-heading">Estadísticas</span>} />
      <ul className="divide-y divide-border border-y border-border" data-testid="profile-stats">
        {rows.map((row) => {
          const content = (
            <>
              <span className="flex-1">
                {row.label}
                {row.note && <span className="block type-caption text-ink-faint">{row.note}</span>}
              </span>
              {row.thisYear !== undefined && (
                <span className="type-meta text-ink-faint">{row.thisYear} este año</span>
              )}
              {row.value !== undefined && row.value !== null && (
                <span className="type-meta font-semibold tabular-nums text-ink-muted">
                  {row.value}
                </span>
              )}
            </>
          );
          return (
            <li key={row.label}>
              {row.href ? (
                <Link
                  href={row.href}
                  className="flex min-h-11 items-center gap-3 px-1 py-2.5 type-body text-ink transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
                >
                  {content}
                  <Icon name="chevron-right" className="h-4 w-4 text-ink-faint" />
                </Link>
              ) : (
                <div className="flex min-h-11 items-center gap-3 px-1 py-2.5 pr-8 type-body text-ink">
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
