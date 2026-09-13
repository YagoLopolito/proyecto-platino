import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import {
  TrophyTypeIcon,
  trophyTypeLabel,
  PSN_TROPHY_TYPES,
  type PsnTrophyType,
} from "@/components/TrophyTypeIcon";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/Button";
import { isVisibleInLibrary } from "@/lib/library/visibility";
import { SectionHeader, SectionAction } from "@/components/ui/SectionHeader";
import { ProfileHeader, ProfileBadge } from "@/components/profile/ProfileHeader";
import { ProfileStatStrip } from "@/components/profile/ProfileStatStrip";
import { FavoriteGamesSection } from "@/components/profile/FavoriteGamesSection";
import {
  DiaryPreviewSection,
  PROFILE_DIARY_PREVIEW_LIMIT,
} from "@/components/profile/DiaryPreviewSection";
import { FriendsStrip } from "@/components/profile/FriendsStrip";
import { TopFiveEditor } from "@/components/profile/TopFiveEditor";
import { getFavoriteGames } from "@/lib/profile/queries";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import { getFriends } from "@/lib/friends/queries";

// Solo los tipos de PSN: los logros de Steam no tienen desglose ni puntos de
// nivel, así que no entran en este panel (ver PRODUCT_SPEC.md 12.4).
const TROPHY_TYPES = PSN_TROPHY_TYPES;

/**
 * Puntos por tipo de trofeo, según la escala clásica que usa PSN para calcular
 * el nivel de trofeos (bronce 15, plata 30, oro 90, platino 300).
 */
const TROPHY_POINTS: Record<PsnTrophyType, number> = {
  bronze: 15,
  silver: 30,
  gold: 90,
  platinum: 300,
};

/**
 * Curva de nivel oficial de PSN: cada nivel requiere más puntos que el
 * anterior, en tramos que se vuelven más caros. Replica la fórmula pública
 * que usa PSNProfiles para el nivel de trofeos.
 */
function levelFromPoints(points: number): { level: number; progressPercent: number } {
  const TIERS: { upToLevel: number; cost: number }[] = [
    { upToLevel: 2, cost: 30 },
    { upToLevel: 8, cost: 200 },
    { upToLevel: 16, cost: 400 },
    { upToLevel: 40, cost: 800 },
    { upToLevel: 100, cost: 1400 },
    { upToLevel: 999, cost: 2000 },
  ];

  let remaining = points;
  let level = 1;

  for (const tier of TIERS) {
    while (level < tier.upToLevel) {
      if (remaining < tier.cost) {
        return { level, progressPercent: Math.floor((remaining / tier.cost) * 100) };
      }
      remaining -= tier.cost;
      level += 1;
    }
  }

  return { level, progressPercent: 0 };
}

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // get_library_trophy_stats agrega por juego con GROUP BY en Postgres (ver migración
  // 20260820020000); acá se suman esas filas (como mucho una por juego en la
  // biblioteca) en vez de paginar manualmente por TODOS los user_trophies de la
  // cuenta (con backlogs grandes eran varios round-trips seriales de a 1000 filas
  // solo para totalizar 4 números).
  const [
    { data: psnAccount },
    { data: steamAccount },
    { data: libraryRows },
    { data: statsRows },
    favorites,
    diaryOutcome,
    friends,
  ] = await Promise.all([
    supabase
      .from("psn_accounts")
      .select(
        "online_id, avatar_url, trophy_level, trophy_progress, trophy_tier, earned_platinum, earned_gold, earned_silver, earned_bronze",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("steam_accounts").select("persona_name").eq("user_id", user.id).maybeSingle(),
    // Mismo criterio que /juegos, vía `isVisibleInLibrary`: los juegos de
    // catálogo y la basura de Steam (nunca jugada y sin logros) no cuentan
    // como biblioteca. Se traen las filas en vez de pedir un count porque el
    // criterio cruza `playtime_minutes` con los logros obtenidos, que salen
    // del RPC.
    // La carátula viaja también porque la misma lista alimenta al editor del
    // Top 5, que muestra la biblioteca para elegir.
    supabase
      .from("user_games")
      .select("game_id, playtime_minutes, games!inner (id, name, cover_url, icon_url, source)")
      .eq("user_id", user.id),
    supabase.rpc("get_library_trophy_stats"),
    getFavoriteGames(supabase, user.id),
    getUserDiaryEntries(supabase, user.id, PROFILE_DIARY_PREVIEW_LIMIT),
    getFriends(supabase, user.id),
  ]);

  const statsByGame = new Map((statsRows ?? []).map((row) => [row.game_id, row]));
  const visibleGames = (libraryRows ?? []).filter((row) =>
    isVisibleInLibrary({
      source: row.games?.source ?? null,
      playtimeMinutes: row.playtime_minutes,
      obtained: statsByGame.get(row.game_id)?.obtained ?? 0,
    }),
  );
  const gamesCount = visibleGames.length;

  // Candidatos del editor del Top 5: la biblioteca visible, alfabética (el
  // editor filtra por nombre, así que el orden que sirve es el del abecedario y
  // no el del último sync).
  const favoriteCandidates = visibleGames
    .flatMap((row) =>
      row.games
        ? [
            {
              id: row.games.id,
              name: row.games.name,
              imageUrl: row.games.cover_url ?? row.games.icon_url,
            },
          ]
        : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  // Las stats van SEPARADAS por plataforma: un platino de PSN y un 100% de
  // Steam no son la misma unidad, y sumarlos da un número que no significa
  // nada. El total de juegos sí se puede sumar, y es el único que se suma.
  const steamStats = visibleGames
    .filter((row) => row.games?.source === "steam")
    .reduce(
      (acc, row) => {
        const stats = statsByGame.get(row.game_id);
        acc.games += 1;
        acc.achievements += stats?.obtained ?? 0;
        if (stats && stats.total > 0 && stats.obtained === stats.total) acc.completed += 1;
        return acc;
      },
      { games: 0, achievements: 0, completed: 0 },
    );

  const counts: Record<PsnTrophyType, number> = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const row of statsRows ?? []) {
    counts.platinum += row.platinum;
    counts.gold += row.gold;
    counts.silver += row.silver;
    counts.bronze += row.bronze;
  }

  // Los números que muestra el perfil son los que devuelve PSN
  // (psn_accounts.trophy_*/earned_*, guardados al conectar la cuenta y en cada
  // sync). Lo calculado a partir de la biblioteca local queda solo como
  // fallback para cuentas que todavía no sincronizaron con esas columnas.
  const psnCounts =
    psnAccount?.earned_bronze !== null && psnAccount?.earned_bronze !== undefined
      ? {
          platinum: psnAccount.earned_platinum ?? 0,
          gold: psnAccount.earned_gold ?? 0,
          silver: psnAccount.earned_silver ?? 0,
          bronze: psnAccount.earned_bronze,
        }
      : null;

  const displayCounts = psnCounts ?? counts;
  const totalTrophies = Object.values(displayCounts).reduce((sum, n) => sum + n, 0);
  const totalPoints = TROPHY_TYPES.reduce(
    (sum, type) => sum + displayCounts[type] * TROPHY_POINTS[type],
    0,
  );
  const computed = levelFromPoints(totalPoints);
  const level = psnAccount?.trophy_level ?? computed.level;
  const progressPercent = psnAccount?.trophy_progress ?? computed.progressPercent;
  const isRealPsnData = psnCounts !== null && psnAccount?.trophy_level !== null;
  const diaryEntries = diaryOutcome.status === "ok" ? diaryOutcome.entries : [];

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-6 text-zinc-50 sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <ProfileHeader
          name={psnAccount?.online_id ?? "Perfil"}
          subtitle={user.email}
          avatarUrl={psnAccount?.avatar_url ?? null}
          badges={
            <>
              {psnAccount && <ProfileBadge>PSN · {psnAccount.online_id}</ProfileBadge>}
              {steamAccount && (
                <ProfileBadge>Steam · {steamAccount.persona_name ?? "conectada"}</ProfileBadge>
              )}
              {!psnAccount && !steamAccount && (
                <ProfileBadge>Sin plataformas conectadas</ProfileBadge>
              )}
            </>
          }
          actions={
            <form action={logout}>
              <Button type="submit" variant="secondary">
                Cerrar sesión
              </Button>
            </form>
          }
        />

        <ProfileStatStrip
          stats={[
            { label: "Nivel PSN", value: level, progressPercent },
            { label: "Juegos", value: gamesCount },
            { label: "Trofeos", value: totalTrophies },
          ]}
        />

        {/* El Top 5 lo elige el usuario: es lo primero que se ve del perfil,
            antes que cualquier número. */}
        <FavoriteGamesSection
          games={favorites}
          emptyMessage="Todavía no elegiste tu Top 5. Elegí hasta 5 juegos de tu biblioteca para mostrarlos acá."
          action={
            <TopFiveEditor
              games={favoriteCandidates}
              selectedIds={favorites.map((game) => game.id)}
            />
          }
        />

        <DiaryPreviewSection
          entries={diaryEntries}
          emptyMessage="Todavía no marcaste ninguna partida como terminada."
          action={
            <Link href="/diario">
              <SectionAction>Ver diario</SectionAction>
            </Link>
          }
        />

        <FriendsStrip friends={friends} />

        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          {/* Todo este panel es de PSN: nivel, puntos y los cuatro tipos de
              trofeo. Steam no tiene nada de eso, por eso va con su título y su
              propio panel abajo en vez de mezclarse acá. */}
          <SectionHeader title="PlayStation Network · trofeos por tipo" />
          {/*
           * 2 columnas en mobile (4 no entran sin achicar el ícono a algo
           * ilegible) y 4 a partir de sm. Dentro de cada tarjeta el ícono va
           * al lado del número, alineados en una fila, en vez de apretado
           * arriba a la derecha como cuando esto usaba StatCard.
           */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TROPHY_TYPES.map((type) => (
              <div
                key={type}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 sm:flex-col sm:gap-2 sm:p-4 sm:text-center"
              >
                <TrophyTypeIcon type={type} className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" />
                <div className="min-w-0 sm:space-y-0.5">
                  <p className="text-2xl font-semibold leading-none">{displayCounts[type]}</p>
                  <p className="text-xs text-zinc-400">{trophyTypeLabel(type)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="pt-1 text-xs text-zinc-600">
            {isRealPsnData
              ? "Nivel y totales tal cual los informa PSN para tu cuenta."
              : "Totales calculados a partir de los juegos ya sincronizados: sincronizá tu cuenta PSN para ver tus números reales."}
          </p>
        </div>

        {steamAccount && (
          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <SectionHeader title="Steam · logros" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Juegos de Steam" value={steamStats.games} />
              <StatCard label="Logros desbloqueados" value={steamStats.achievements} />
              <StatCard label="Juegos al 100%" value={steamStats.completed} />
            </div>
            <p className="pt-1 text-xs text-zinc-600">
              Los logros de Steam no tienen tipo ni platino: el equivalente es completar el 100% de
              un juego. Por eso no se suman con los trofeos de PSN.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/juegos"
            className="block w-full rounded bg-blue-600 px-4 py-2 text-center font-medium text-white hover:bg-blue-500"
          >
            Mi biblioteca
          </Link>
          <Link
            href="/configuracion/conexiones"
            className="block w-full rounded border border-zinc-700 px-4 py-2 text-center font-medium text-zinc-50 hover:border-blue-500"
          >
            {psnAccount ? `PSN conectada: ${psnAccount.online_id}` : "Conectar cuenta PSN"}
          </Link>
        </div>
      </div>
    </div>
  );
}
