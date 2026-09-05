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
        <EmptyState title="Todavía no marcaste ninguna partida como terminada." />
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
            className={`shrink-0 rounded border px-3 py-1.5 text-sm ${
              option === year
                ? "border-blue-600 bg-blue-900/30 text-blue-300"
                : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
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
          <ul className="space-y-2">
            {summary.topRated.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 sm:items-center"
              >
                <Cover imageUrl={entry.imageUrl} name={entry.gameName} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/juegos/${entry.gameId}`}
                    className="block text-sm font-medium break-words hover:underline sm:text-base"
                  >
                    {entry.gameName}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                    <StarRatingDisplay rating={entry.rating} />
                    <span>{entry.finishedOn}</span>
                    {entry.isPlatinum && <span>🏆 Platino</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader title="Estadísticas avanzadas" />

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Juegos terminados por mes</p>
          <ul className="mt-3 flex h-28 items-end gap-0.5 sm:gap-1">
            {advanced.monthlyCounts.map((count, index) => {
              const max = Math.max(1, ...advanced.monthlyCounts);
              return (
                <li key={index} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-zinc-500">{count || ""}</span>
                  <div
                    className="w-full rounded-t bg-blue-600"
                    style={{ height: `${(count / max) * 72}px` }}
                    title={`${MONTH_NAMES[index]}: ${count}`}
                  />
                  <span className="text-[9px] text-zinc-600 sm:text-[10px]">
                    {MONTH_NAMES[index].slice(0, 3)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Cómo puntuaste ({advanced.ratedCount} valoradas)</p>
          {advanced.ratedCount === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              Todavía no puntuaste ninguna partida de {year}.
            </p>
          ) : (
            <ul className="mt-3 space-y-1">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = advanced.ratingDistribution[stars - 1];
                const max = Math.max(1, ...advanced.ratingDistribution);
                return (
                  <li key={stars} className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className="w-10 shrink-0 tabular-nums">{stars} ★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full bg-[var(--color-trophy-gold)]"
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
            label="Plataforma más jugada"
            value={
              advanced.topPlatform
                ? `${advanced.topPlatform.platform} (${advanced.topPlatform.count})`
                : "—"
            }
          />
          <Stat
            label="Racha de meses seguidos"
            value={
              advanced.longestMonthlyStreak
                ? `${advanced.longestMonthlyStreak.months} (${advanced.longestMonthlyStreak.from} → ${advanced.longestMonthlyStreak.to})`
                : "—"
            }
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Mes a mes" />
        {monthsWithEntries.map((month) => (
          <div key={month.month} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{month.monthName}</h3>
              <p className="text-xs text-zinc-500">
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
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-6 text-zinc-50 sm:py-16">
      <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">Resumen del diario</h1>
            <p className="text-sm text-zinc-400">
              Tus partidas terminadas, mes a mes y con el balance del año.
            </p>
          </div>
          <Link
            href="/diario"
            className="block rounded border border-zinc-700 px-3 py-2 text-center text-sm text-zinc-300 hover:border-zinc-500 sm:py-1.5"
          >
            ← Volver al diario
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-semibold break-words sm:text-lg">{value}</p>
    </div>
  );
}

function CoverPlaceholder() {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-500">
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
      className="h-12 w-12 shrink-0 rounded object-cover"
      fallback={<CoverPlaceholder />}
    />
  );
}
