import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import { redirect } from "next/navigation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { createClient } from "@/lib/supabase/server";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import { advancedStats, availableYears, MONTH_NAMES, summarizeYear } from "@/lib/diary/stats";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { BackToDiaryLink } from "@/components/diary/BackToDiaryLink";
import { Icon } from "@/components/ui/Icon";

/**
 * Resumen mensual/anual del diario (issue #94). Todo se calcula server-side
 * desde las mismas entradas que muestra `/diario`, así los números son
 * consistentes entre las dos vistas.
 */
export default async function DiarySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const { anio } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const outcome = await getUserDiaryEntries(supabase, user.id);

  if (outcome.status === "error") {
    return (
      <PageShell>
        <ErrorState message={`No se pudo cargar el resumen: ${outcome.message}`} />
      </PageShell>
    );
  }

  const years = availableYears(outcome.entries);

  if (years.length === 0) {
    return (
      <PageShell>
        <EmptyState icon="chart" title="Todavía no marcaste ninguna partida como terminada." />
      </PageShell>
    );
  }

  const requestedYear = Number(anio);
  const year = years.includes(requestedYear) ? requestedYear : years[0];
  const summary = summarizeYear(outcome.entries, year);
  const advanced = advancedStats(outcome.entries, year);
  const monthsWithEntries = summary.months.filter((month) => month.finishedCount > 0).reverse();

  return (
    <PageShell>
      {/* Los años scrollean horizontalmente en mobile en vez de partirse en
          varias filas (mismo patrón que la nav del header). */}
      <nav
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        aria-label="Elegir año"
      >
        {years.map((option) => (
          <Link
            key={option}
            href={`/diario/resumen?anio=${option}`}
            aria-current={option === year ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center rounded-chip border px-3 type-meta font-medium transition-colors sm:min-h-0 sm:py-1.5 ${
              option === year
                ? "border-accent-ink bg-accent/15 text-accent-ink"
                : "border-border-strong text-ink-muted hover:border-ink-muted hover:text-ink"
            }`}
          >
            {option}
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Juegos terminados" value={String(summary.finishedCount)} />
        <Stat label="Platinos" value={String(summary.platinumCount)} />
        <Stat
          label="Rating promedio"
          value={
            summary.averageRating !== null ? `${(summary.averageRating / 2).toFixed(1)}/5` : "—"
          }
        />
        <Stat
          size="text"
          label="Mes más activo"
          value={
            summary.busiestMonth
              ? `${summary.busiestMonth.monthName} (${summary.busiestMonth.finishedCount})`
              : "—"
          }
        />
      </section>

      {summary.topRated.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title={`Tus mejor puntuados de ${year}`} />
          <ul className="divide-y divide-border">
            {summary.topRated.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 py-2.5 sm:items-center">
                <Cover imageUrl={entry.imageUrl} name={entry.gameName} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/juegos/${entry.gameId}`}
                    className="block type-subtitle break-words text-ink hover:underline"
                  >
                    {entry.gameName}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-ink-faint">
                    <StarRatingDisplay rating={entry.rating} />
                    <span>{entry.finishedOn}</span>
                    {entry.isPlatinum && (
                      <span className="inline-flex items-center gap-1 text-trophy-platinum">
                        <Icon name="trophy" className="h-3.5 w-3.5" />
                        Platino
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader title="Estadísticas avanzadas" />

        <div className="rounded-card border border-border bg-surface p-4">
          <p className="type-overline text-ink-faint">Juegos terminados por mes</p>
          <ul className="mt-3 flex h-28 items-end gap-0.5 sm:gap-1">
            {advanced.monthlyCounts.map((count, index) => {
              const max = Math.max(1, ...advanced.monthlyCounts);
              return (
                <li key={index} className="flex flex-1 flex-col items-center gap-1">
                  <span className="type-caption tabular-nums text-ink-faint">{count || ""}</span>
                  <div
                    className="w-full rounded-t bg-accent"
                    style={{ height: `${(count / max) * 72}px` }}
                    title={`${MONTH_NAMES[index]}: ${count}`}
                  />
                  <span className="type-caption text-ink-faint">
                    {MONTH_NAMES[index].slice(0, 3)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-card border border-border bg-surface p-4">
          <p className="type-overline text-ink-faint">
            Cómo puntuaste ({advanced.ratedCount} valoradas)
          </p>
          {advanced.ratedCount === 0 ? (
            <p className="mt-2 type-body text-ink-muted">
              Todavía no puntuaste ninguna partida de {year}.
            </p>
          ) : (
            <ul className="mt-3 space-y-1">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = advanced.ratingDistribution[stars - 1];
                const max = Math.max(1, ...advanced.ratingDistribution);
                return (
                  <li key={stars} className="flex items-center gap-2 type-meta text-ink-faint">
                    <span className="flex w-10 shrink-0 items-center gap-1 tabular-nums">
                      {stars}
                      <Icon name="star" className="h-3 w-3 text-trophy-gold" />
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className="h-full bg-trophy-gold"
                        style={{ width: `${Math.round((count / max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right tabular-nums">{count}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat
            size="text"
            label="Plataforma más jugada"
            value={
              advanced.topPlatform
                ? `${advanced.topPlatform.platform} (${advanced.topPlatform.count})`
                : "—"
            }
          />
          <Stat
            size="text"
            label="Racha de meses seguidos"
            value={
              advanced.longestMonthlyStreak
                ? `${advanced.longestMonthlyStreak.months}, de ${advanced.longestMonthlyStreak.from} a ${advanced.longestMonthlyStreak.to}`
                : "—"
            }
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Mes a mes" />
        {monthsWithEntries.map((month) => (
          <div key={month.month} className="rounded-card border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="type-subtitle text-ink">{month.monthName}</h3>
              <p className="type-meta text-ink-faint">
                {month.finishedCount} {month.finishedCount === 1 ? "juego" : "juegos"}
                {month.platinumCount > 0 &&
                  ` · ${month.platinumCount} platino${month.platinumCount === 1 ? "" : "s"}`}
                {month.averageRating !== null &&
                  ` · ${(month.averageRating / 2).toFixed(1)}/5 promedio`}
              </p>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {month.entries.map((entry) => (
                <li key={entry.id}>
                  <Link href={`/juegos/${entry.gameId}`} title={entry.gameName}>
                    <Cover imageUrl={entry.imageUrl} name={entry.gameName} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-16">
      <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="type-title text-ink">Resumen del diario</h1>
            <p className="type-body text-ink-muted">
              Tus partidas terminadas, mes a mes y con el balance del año.
            </p>
          </div>
          <BackToDiaryLink />
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Celda de la tira de estadísticas: número grande arriba, etiqueta en
 * versalitas abajo (el mismo patrón que `GameDetailHero`).
 *
 * `size="text"` es para los valores que no son un número sino una frase
 * ("Septiembre (4)", "3 meses, de Enero a Marzo"): a 24px ocupan tres
 * renglones y rompen la tira, así que bajan a tamaño de subtítulo.
 */
function Stat({
  label,
  value,
  size = "stat",
}: {
  label: string;
  value: string;
  size?: "stat" | "text";
}) {
  return (
    <div className="space-y-0.5 rounded-card border border-border bg-surface px-3 py-2.5">
      <p className={`break-words text-ink ${size === "stat" ? "type-stat" : "type-subtitle"}`}>
        {value}
      </p>
      <p className="type-overline text-ink-faint">{label}</p>
    </div>
  );
}

function CoverPlaceholder() {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-chip bg-surface-hover type-caption text-ink-faint">
      Sin img
    </div>
  );
}

function Cover({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (!imageUrl) return <CoverPlaceholder />;
  return (
    <GameArt
      src={imageUrl}
      alt={name}
      width={48}
      height={48}
      className="h-12 w-12 shrink-0 rounded-chip object-cover"
      fallback={<CoverPlaceholder />}
    />
  );
}
