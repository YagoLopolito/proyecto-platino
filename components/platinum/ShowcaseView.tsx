import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ProfileStatStrip } from "@/components/profile/ProfileStatStrip";
import { TrophyTypeStrip } from "@/components/profile/TrophyTypeStrip";
import type { PsnTrophyType } from "@/components/TrophyTypeIcon";
import { PlatinumTrophy } from "./PlatinumTrophy";
import { NextPlatinumShelf, ShowcaseShelf } from "./ShowcaseShelf";
import type { NextPlatinumCandidate } from "@/lib/platinum/queries";
import {
  formatDaysToPlatinum,
  formatEarnedRate,
  groupShowcaseShelves,
  showcaseStats,
  sortPieces,
  type PlatinumPiece,
  type ShowcaseOrder,
} from "@/lib/platinum/stats";

const ORDER_LABEL: Record<ShowcaseOrder, string> = {
  antiguos: "Primeros",
  recientes: "Recientes",
  rareza: "Más raros",
};

/** Cuántas carátulas cargan con prioridad: la primera fila en escritorio. */
const PRIORITY_PIECES = 5;

/**
 * La vitrina de platinos, sin datos de la base: la página los trae y esto los
 * pone en pantalla. Tres bloques:
 *
 * 1. La portada: el trofeo con su halo, el total en grande y las cuatro
 *    marcas de la colección (más raro, más rápido, mejor año, último). En
 *    escritorio van lado a lado; en mobile, una debajo de la otra.
 * 2. La colección: un mueble con los años como divisores (sin años si se
 *    ordena por rareza), y el orden como control segmentado en su propia
 *    fila -- al lado del título no entraba en un celular y la página se
 *    desbordaba de costado.
 * 3. Los próximos platinos y los totales de PSN.
 */
export function ShowcaseView({
  order,
  collection,
  next,
  psnLevel,
  typeCounts,
  isRealPsnData,
}: {
  order: ShowcaseOrder;
  collection: PlatinumPiece[];
  next: NextPlatinumCandidate[];
  psnLevel: { level: number; progress: number } | null;
  typeCounts: Record<PsnTrophyType, number>;
  isRealPsnData: boolean;
}) {
  const stats = showcaseStats(collection);
  const shelves = groupShowcaseShelves(sortPieces(collection, order), order);
  const latest = collection.reduce<PlatinumPiece | null>(
    (acc, piece) => (acc === null || piece.number > acc.number ? piece : acc),
    null,
  );

  const headline = [
    {
      label: "El más raro",
      value: stats.rarest?.earnedRate != null ? formatEarnedRate(stats.rarest.earnedRate) : "—",
      detail: stats.rarest?.name ?? null,
    },
    {
      label: "El más rápido",
      value: !stats.fastest
        ? "—"
        : stats.fastest.days === 0
          ? "Mismo día"
          : formatDaysToPlatinum(stats.fastest.days).replace(/^en /, ""),
      detail: stats.fastest?.name ?? null,
    },
    {
      label: "Mejor año",
      value: stats.bestYear ? String(stats.bestYear.year) : "—",
      detail: stats.bestYear
        ? `${stats.bestYear.count} ${stats.bestYear.count === 1 ? "platino" : "platinos"}`
        : null,
    },
    {
      label: "El último",
      value: latest ? `#${latest.number}` : "—",
      detail: latest?.name ?? null,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10">
      {/* Portada. El marco metálico es el mismo de una carátula platinada. */}
      <header className="platinum-frame">
        <div className="relative overflow-hidden rounded-card bg-surface-raised">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] max-w-[140%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,var(--platinum-glow),transparent_70%)] lg:left-40"
          />
          <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:gap-10 lg:p-8">
            <div className="flex items-center gap-4 sm:gap-6">
              <span className="relative flex h-24 w-24 shrink-0 items-center justify-center sm:h-32 sm:w-32">
                <span
                  aria-hidden="true"
                  className="platinum-pulse absolute inset-2 rounded-full bg-platinum-glow blur-2xl"
                />
                <PlatinumTrophy size={96} priority className="relative sm:h-32 sm:w-32" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="type-overline text-trophy-platinum">Colección de platinos</p>
                <h1 className="type-title text-ink">Vitrina</h1>
                <p data-testid="showcase-total" className="flex items-baseline gap-2 text-ink">
                  <span className="type-display tabular-nums">
                    {stats.total.toLocaleString("es-AR")}
                  </span>
                  <span className="type-meta text-ink-muted">
                    {stats.total === 1 ? "platino" : "platinos"}
                  </span>
                </p>
              </div>
            </div>

            <dl
              data-testid="showcase-stats"
              className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border"
            >
              <div className="sr-only">
                <dt>Platinos</dt>
                <dd>{stats.total}</dd>
              </div>
              {headline.map((stat) => (
                <div key={stat.label} className="min-w-0 bg-surface/90 px-3 py-3 sm:px-4">
                  <dt className="type-overline text-ink-faint">{stat.label}</dt>
                  <dd className="mt-1 type-stat text-ink">{stat.value}</dd>
                  {stat.detail && (
                    <dd className="mt-0.5 truncate type-caption text-ink-muted" title={stat.detail}>
                      {stat.detail}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </div>
        </div>
      </header>

      <section className="space-y-5" aria-labelledby="showcase-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <SectionHeader title={<span id="showcase-heading">La colección</span>} />
          </div>
          {collection.length > 1 && (
            // Segmentado como links (el orden vive en la URL, como el filtro
            // de fuente de la biblioteca). A ancho completo en mobile.
            <nav
              aria-label="Ordenar la vitrina"
              className="flex w-full rounded-card border border-border-strong bg-surface p-0.5 sm:w-auto"
            >
              {(Object.keys(ORDER_LABEL) as ShowcaseOrder[]).map((value) => (
                <Link
                  key={value}
                  href={value === "antiguos" ? "/vitrina" : `/vitrina?orden=${value}`}
                  aria-current={order === value ? "page" : undefined}
                  className={`flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-chip px-3 type-caption font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 sm:min-h-9 ${
                    order === value
                      ? "bg-accent/15 text-accent-ink shadow-[inset_0_0_0_1px_var(--color-accent-ink)]"
                      : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                  }`}
                >
                  {ORDER_LABEL[value]}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {collection.length === 0 ? (
          <EmptyState
            icon="trophy"
            title="Tu vitrina todavía está vacía."
            description="Cuando consigas tu primer platino (y sincronices tu cuenta PSN), va a aparecer acá."
          />
        ) : (
          <ShowcaseShelf
            groups={shelves}
            rarestGameId={stats.rarest?.gameId ?? null}
            priorityCount={PRIORITY_PIECES}
          />
        )}
      </section>

      <section className="space-y-4" aria-labelledby="next-platinum-heading">
        <SectionHeader
          title={<span id="next-platinum-heading">Lo que viene</span>}
          description="Los juegos que tenés más cerca de platinar."
        />
        <NextPlatinumShelf candidates={next} />
      </section>

      <section className="space-y-3" aria-labelledby="psn-trophies-heading">
        <SectionHeader
          title={<span id="psn-trophies-heading">PlayStation Network · trofeos por tipo</span>}
        />
        {psnLevel && (
          <ProfileStatStrip
            stats={[
              { label: "Nivel PSN", value: psnLevel.level, progressPercent: psnLevel.progress },
            ]}
          />
        )}
        <TrophyTypeStrip counts={typeCounts} />
        <p className="type-caption text-ink-faint">
          {isRealPsnData
            ? "Nivel y totales tal cual los informa PSN para tu cuenta."
            : "Totales calculados a partir de los juegos ya sincronizados: sincronizá tu cuenta PSN para ver tus números reales."}
        </p>
      </section>
    </div>
  );
}
