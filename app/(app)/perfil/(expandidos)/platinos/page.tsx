import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ProfileStatStrip } from "@/components/profile/ProfileStatStrip";
import { TrophyTypeStrip } from "@/components/profile/TrophyTypeStrip";
import { ProfileSubpage, formatInstant } from "@/components/profile/ProfileSubpage";
import { getOwnProfileSummary } from "@/lib/profile/summary";
import { countWithYear, yearOfInstant } from "@/lib/profile/stats";

export const metadata = { title: "Platinos" };

/**
 * Platinos de PSN (issue #196), con la fecha de cada uno. El nivel de trofeos y
 * el desglose por tipo (`TrophyTypeStrip`) se mudaron acá desde la pantalla
 * principal del perfil: son números de PSN, y el perfil ahora arranca con lo
 * que el usuario elige mostrar.
 */
export default async function PlatinosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [summary, { data: psnAccount }, { data: statsRows }] = await Promise.all([
    getOwnProfileSummary(supabase, user.id),
    supabase
      .from("psn_accounts")
      .select(
        "trophy_level, trophy_progress, earned_platinum, earned_gold, earned_silver, earned_bronze",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.rpc("get_library_trophy_stats"),
  ]);
  const { platinums, year } = summary;
  const count = countWithYear(
    platinums.map((p) => yearOfInstant(p.unlockedAt)),
    year,
  );

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

  return (
    <ProfileSubpage
      title="Platinos"
      subtitle={`${count.total} en total · ${count.thisYear} en ${year}`}
    >
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

      {platinums.length === 0 ? (
        <EmptyState icon="trophy" title="Todavía no hay platinos sincronizados." />
      ) : (
        <PosterGrid>
          {platinums.map((game) => (
            <li key={game.gameId} data-testid="platinum-game">
              <GamePoster
                href={`/juegos/${game.gameId}`}
                name={game.name}
                imageUrl={game.imageUrl}
                isPlatinum
                showName
                caption={<span className="text-ink-faint">{formatInstant(game.unlockedAt)}</span>}
              />
            </li>
          ))}
        </PosterGrid>
      )}
    </ProfileSubpage>
  );
}
