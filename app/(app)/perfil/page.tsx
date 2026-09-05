import { redirect } from "next/navigation";
import Link from "next/link";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import {
  TrophyTypeIcon,
  trophyTypeLabel,
  PSN_TROPHY_TYPES,
  type PsnTrophyType,
} from "@/components/TrophyTypeIcon";
import { ProgressBar } from "@/components/ProgressBar";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/Button";
import { isVisibleInLibrary } from "@/lib/library/visibility";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterRow, PosterRowItem } from "@/components/game/PosterGrid";
import { SectionHeader, SectionAction } from "@/components/ui/SectionHeader";

// Solo los tipos de PSN: los logros de Steam no tienen desglose ni puntos de
// nivel, así que no entran en este panel (ver PRODUCT_SPEC.md 12.4).
const TROPHY_TYPES = PSN_TROPHY_TYPES;

/** Cuántas carátulas entran en la fila de "Últimos jugados" del perfil. */
const RECENT_GAMES_LIMIT = 12;

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
  const [{ data: psnAccount }, { data: steamAccount }, { data: libraryRows }, { data: statsRows }] =
    await Promise.all([
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
      // Se traen también carátula y último jugado: el perfil muestra una fila
      // de "Últimos jugados" con las mismas carátulas que la biblioteca.
      supabase
        .from("user_games")
        .select(
          "game_id, playtime_minutes, last_played_at, games!inner (id, name, cover_url, icon_url, source)",
        )
        .eq("user_id", user.id),
      supabase.rpc("get_library_trophy_stats"),
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

  // Últimos jugados, para la fila de carátulas del perfil. Los que nunca se
  // jugaron van al fondo en vez de mezclarse con los recientes.
  const recentGames = [...visibleGames]
    .sort((a, b) => {
      const aTime = a.last_played_at ? new Date(a.last_played_at).getTime() : -1;
      const bTime = b.last_played_at ? new Date(b.last_played_at).getTime() : -1;
      return bTime - aTime;
    })
    .slice(0, RECENT_GAMES_LIMIT)
    .flatMap((row) => {
      const game = row.games;
      if (!game) return [];
      const stats = statsByGame.get(row.game_id);
      const total = stats?.total ?? 0;
      const obtained = stats?.obtained ?? 0;
      return {
        id: game.id,
        name: game.name,
        imageUrl: game.cover_url ?? game.icon_url,
        isSteam: game.source === "steam",
        total,
        obtained,
        // El RPC devuelve totales, no el %: se calcula acá igual que en /juegos.
        percent: total > 0 ? Math.round((obtained / total) * 100) : 0,
        platinum: stats?.platinum ?? 0,
      };
    });

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

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-6 text-zinc-50 sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <FriendAvatar
              url={psnAccount?.avatar_url ?? null}
              name={psnAccount?.online_id ?? "?"}
              size={64}
            />
            <div className="min-w-0 space-y-0.5">
              <h1 className="truncate text-xl font-semibold sm:text-2xl">
                {psnAccount?.online_id ?? "Perfil"}
              </h1>
              <p className="truncate font-mono text-xs text-zinc-500 sm:text-sm">{user.email}</p>
            </div>
          </div>
          <form action={logout}>
            <Button type="submit" variant="secondary">
              Cerrar sesión
            </Button>
          </form>
        </div>

        {/*
         * Tira de números al estilo Letterbox: número grande, etiqueta chica
         * en versalitas, separadas por una línea de 1px. Reemplaza a las
         * tarjetas sueltas, que en mobile ocupaban media pantalla.
         */}
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800">
          <div className="bg-zinc-950 px-3 py-3">
            <dd className="text-2xl font-semibold leading-none">{level}</dd>
            <dt className="mt-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              Nivel PSN
            </dt>
            <ProgressBar percent={progressPercent} className="mt-2 h-1" />
          </div>
          <div className="bg-zinc-950 px-3 py-3">
            <dd className="text-2xl font-semibold leading-none">{gamesCount}</dd>
            <dt className="mt-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">Juegos</dt>
          </div>
          <div className="bg-zinc-950 px-3 py-3">
            <dd className="text-2xl font-semibold leading-none">{totalTrophies}</dd>
            <dt className="mt-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">Trofeos</dt>
          </div>
        </dl>

        {recentGames.length > 0 && (
          <section className="space-y-3">
            <SectionHeader
              title="Últimos jugados"
              action={
                <Link href="/juegos">
                  <SectionAction>Ver todo</SectionAction>
                </Link>
              }
            />
            {/* Carrusel horizontal: el orden importa (lo más reciente primero)
                y no hace falta ver la biblioteca entera desde el perfil. */}
            <PosterRow>
              {recentGames.map((game) => (
                <PosterRowItem key={game.id}>
                  <GamePoster
                    href={`/juegos/${game.id}`}
                    name={game.name}
                    imageUrl={game.imageUrl}
                    progress={game.total > 0 ? game : null}
                    isPlatinum={!game.isSteam && game.platinum > 0}
                    isCompleted={game.isSteam && game.total > 0 && game.obtained === game.total}
                    sizes="(max-width: 640px) 26vw, 112px"
                  />
                </PosterRowItem>
              ))}
            </PosterRow>
          </section>
        )}

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
