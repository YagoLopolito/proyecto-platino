import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ProfileStatStrip } from "@/components/profile/ProfileStatStrip";
import { TrophyTypeStrip } from "@/components/profile/TrophyTypeStrip";
import { PlatinumTrophy } from "@/components/platinum/PlatinumTrophy";
import { ShowcaseShelf } from "@/components/platinum/ShowcaseShelf";
import { getNextPlatinumCandidates, getPlatinumCollection } from "@/lib/platinum/queries";
import {
  formatDaysToPlatinum,
  formatEarnedRate,
  parseShowcaseOrder,
  showcaseStats,
  sortPieces,
  type ShowcaseOrder,
} from "@/lib/platinum/stats";

export const metadata = { title: "Vitrina" };

const ORDER_LABEL: Record<ShowcaseOrder, string> = {
  antiguos: "Primero → último",
  recientes: "Último → primero",
  rareza: "Más raros",
};

/** Cuántos huecos de "Tu próximo platino" se muestran como máximo. */
const NEXT_SLOTS = 3;

/**
 * Vitrina de platinos: la colección como estante de museo. Reemplaza al
 * expandido `/perfil/platinos` (que ahora redirige acá) y se llega desde el
 * contador de la biblioteca, la fila "Platinos" de Estadísticas del perfil y
 * la celebración de un platino nuevo. Cuenta como sección Perfil en la nav.
 *
 * El orden vive en `?orden=` (links, no estado: linkeable y con "atrás"), como
 * el resto de los filtros de la app.
 */
export default async function VitrinaPage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string }>;
}) {
  const order = parseShowcaseOrder((await searchParams).orden);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [collection, { data: psnAccount }, { data: statsRows }] = await Promise.all([
    getPlatinumCollection(supabase),
    supabase
      .from("psn_accounts")
      .select(
        "trophy_level, trophy_progress, earned_platinum, earned_gold, earned_silver, earned_bronze",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.rpc("get_library_trophy_stats"),
  ]);
  const next = await getNextPlatinumCandidates(supabase, statsRows ?? [], NEXT_SLOTS);
  const stats = showcaseStats(collection);
  const pieces = sortPieces(collection, order);

  // Los totales que informa PSN (guardados en cada sync); los calculados con la
  // biblioteca local quedan como fallback para cuentas sin esas columnas.
  const isRealPsnData =
    psnAccount?.earned_bronze !== null && psnAccount?.earned_bronze !== undefined;
  const typeCounts = isRealPsnData
    ? {
        platinum: psnAccount.earned_platinum ?? 0,
        gold: psnAccount.earned_gold ?? 0,
        silver: psnAccount.earned_silver ?? 0,
        bronze: psnAccount.earned_bronze ?? 0,
      }
    : (statsRows ?? []).reduce(
        (acc, row) => ({
          platinum: acc.platinum + row.platinum,
          gold: acc.gold + row.gold,
          silver: acc.silver + row.silver,
          bronze: acc.bronze + row.bronze,
        }),
        { platinum: 0, gold: 0, silver: 0, bronze: 0 },
      );

  const headline = [
    { label: "Platinos", value: stats.total.toLocaleString("es-AR"), detail: null },
    {
      label: "El más raro",
      value: stats.rarest?.earnedRate != null ? formatEarnedRate(stats.rarest.earnedRate) : "—",
      detail: stats.rarest?.name ?? null,
    },
    {
      label: "El más rápido",
      value: stats.fastest ? formatDaysToPlatinum(stats.fastest.days).replace(/^en /, "") : "—",
      detail: stats.fastest?.name ?? null,
    },
    {
      label: "Mejor año",
      value: stats.bestYear ? String(stats.bestYear.year) : "—",
      detail: stats.bestYear
        ? `${stats.bestYear.count} ${stats.bestYear.count === 1 ? "platino" : "platinos"}`
        : null,
    },
  ];

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="flex items-center gap-4">
          <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <span
              aria-hidden="true"
              className="platinum-pulse absolute inset-1 rounded-full bg-platinum-glow blur-xl"
            />
            <PlatinumTrophy size={56} priority />
          </span>
          <div className="space-y-1">
            <h1 className="type-title text-ink">Vitrina</h1>
            <p className="type-meta text-ink-muted">
              Tus platinos, del primero al último. Cada uno, una pieza de la colección.
            </p>
          </div>
        </header>

        <dl
          data-testid="showcase-stats"
          className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-4"
        >
          {headline.map((stat) => (
            <div key={stat.label} className="min-w-0 bg-surface px-3 py-3">
              <dd className="type-stat text-ink">{stat.value}</dd>
              <dt className="type-overline mt-1 text-ink-faint">{stat.label}</dt>
              {stat.detail && (
                <p className="mt-0.5 truncate type-caption text-ink-muted" title={stat.detail}>
                  {stat.detail}
                </p>
              )}
            </div>
          ))}
        </dl>

        <section className="space-y-4" aria-labelledby="showcase-heading">
          <SectionHeader
            title={<span id="showcase-heading">La colección</span>}
            action={
              collection.length > 1 ? (
                <nav aria-label="Ordenar la vitrina" className="flex flex-wrap gap-1">
                  {(Object.keys(ORDER_LABEL) as ShowcaseOrder[]).map((value) => (
                    <Link
                      key={value}
                      href={value === "antiguos" ? "/vitrina" : `/vitrina?orden=${value}`}
                      aria-current={order === value ? "page" : undefined}
                      className={`flex min-h-10 items-center rounded-chip px-2.5 type-caption font-medium transition-colors sm:min-h-8 ${
                        order === value
                          ? "bg-accent/15 text-accent-ink shadow-[inset_0_0_0_1px_var(--color-accent-ink)]"
                          : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                      }`}
                    >
                      {ORDER_LABEL[value]}
                    </Link>
                  ))}
                </nav>
              ) : undefined
            }
          />

          {collection.length === 0 && (
            <EmptyState
              icon="trophy"
              title="Tu vitrina todavía está vacía."
              description="Cuando consigas tu primer platino (y sincronices tu cuenta PSN), va a aparecer acá."
            />
          )}

          {/* Fondo oscuro de vitrina: el `chrome` es lo único más oscuro que la página. */}
          <div className="rounded-card bg-chrome px-2 pb-6 pt-2 sm:px-4">
            <ShowcaseShelf pieces={pieces} next={next} emptySlots={next.length === 0 ? 1 : 0} />
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="psn-trophies-heading">
          <SectionHeader
            title={<span id="psn-trophies-heading">PlayStation Network · trofeos por tipo</span>}
          />
          {psnAccount?.trophy_level != null && (
            <ProfileStatStrip
              stats={[
                {
                  label: "Nivel PSN",
                  value: psnAccount.trophy_level,
                  progressPercent: psnAccount.trophy_progress ?? 0,
                },
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
    </div>
  );
}
