import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { PSN_TROPHY_TYPES, type PsnTrophyType } from "@/components/TrophyTypeIcon";
import { Button } from "@/components/Button";
import { Icon } from "@/components/ui/Icon";
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
import { TrophyTypeStrip } from "@/components/profile/TrophyTypeStrip";
import { TopFiveEditor } from "@/components/profile/TopFiveEditor";
import { NowPlayingSection } from "@/components/now-playing/NowPlayingSection";
import { getNowPlaying } from "@/lib/now-playing/queries";
import { getFavoriteGames } from "@/lib/profile/queries";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import { getReviewLikes } from "@/lib/likes/queries";
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
    nowPlaying,
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
    getNowPlaying(supabase, user.id),
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
  const reviewLikes = await getReviewLikes(
    supabase,
    user.id,
    diaryEntries.slice(0, PROFILE_DIARY_PREVIEW_LIMIT).map((entry) => entry.id),
  );

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <ProfileHeader
          name={psnAccount?.online_id ?? "Perfil"}
          subtitle={user.email}
          avatarUrl={psnAccount?.avatar_url ?? null}
          badges={
            <>
              {psnAccount && (
                <ProfileBadge icon="gamepad">PSN · {psnAccount.online_id}</ProfileBadge>
              )}
              {steamAccount && (
                <ProfileBadge icon="monitor">
                  Steam · {steamAccount.persona_name ?? "conectada"}
                </ProfileBadge>
              )}
              {!psnAccount && !steamAccount && (
                <ProfileBadge>Sin plataformas conectadas</ProfileBadge>
              )}
            </>
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

        <NowPlayingSection
          games={nowPlaying}
          canStop
          emptyMessage="No estás jugando nada por ahora. Tocá el + para contar qué estás jugando."
        />

        <DiaryPreviewSection
          entries={diaryEntries}
          ratingTone="own"
          likes={reviewLikes}
          emptyMessage="Todavía no marcaste ninguna partida como terminada."
          action={
            <Link href="/perfil/diario">
              <SectionAction>Ver diario</SectionAction>
            </Link>
          }
        />

        <FriendsStrip friends={friends} />

        {/* Todo este bloque es de PSN: nivel, puntos y los cuatro tipos de
            trofeo. Steam no tiene nada de eso, por eso va con su título y su
            propia tira abajo en vez de mezclarse acá. Sin tarjeta contenedora:
            la `SectionHeader` ya ordena, y una tarjeta con una tira adentro
            eran dos marcos para un solo bloque. */}
        <section className="space-y-3" aria-labelledby="psn-trophies-heading">
          <SectionHeader
            title={<span id="psn-trophies-heading">PlayStation Network · trofeos por tipo</span>}
          />
          <TrophyTypeStrip counts={displayCounts} />
          <p className="type-caption text-ink-faint">
            {isRealPsnData
              ? "Nivel y totales tal cual los informa PSN para tu cuenta."
              : "Totales calculados a partir de los juegos ya sincronizados: sincronizá tu cuenta PSN para ver tus números reales."}
          </p>
        </section>

        {steamAccount && (
          <section className="space-y-3" aria-labelledby="steam-stats-heading">
            <SectionHeader title={<span id="steam-stats-heading">Steam · logros</span>} />
            <ProfileStatStrip
              stats={[
                { label: "Juegos de Steam", value: steamStats.games },
                { label: "Logros", value: steamStats.achievements },
                { label: "Al 100%", value: steamStats.completed },
              ]}
            />
            <p className="type-caption text-ink-faint">
              Los logros de Steam no tienen tipo ni platino: el equivalente es completar el 100% de
              un juego. Por eso no se suman con los trofeos de PSN.
            </p>
          </section>
        )}

        {/*
         * Acciones de cuenta, al final y sin competir con el contenido: los
         * links a la biblioteca y a Conexiones que había acá duplicaban la
         * barra inferior de tabs (Juegos / Ajustes), que está a un pulgar de
         * distancia. Queda sólo lo que no vive en ningún tab.
         */}
        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
          {!psnAccount && (
            <Link
              href="/configuracion/conexiones"
              className="type-meta font-medium text-accent-ink hover:underline"
            >
              Conectar cuenta PSN
            </Link>
          )}
          <form action={logout} className="ml-auto">
            <Button type="submit" variant="secondary">
              <Icon name="logout" className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
