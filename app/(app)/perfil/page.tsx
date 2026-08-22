import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { TrophyTypeIcon, trophyTypeLabel, type TrophyType } from "@/components/TrophyTypeIcon";
import { ProgressBar } from "@/components/ProgressBar";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/Button";

const TROPHY_TYPES: TrophyType[] = ["platinum", "gold", "silver", "bronze"];

/**
 * Puntos por tipo de trofeo, según la escala clásica que usa PSN para calcular
 * el nivel de trofeos (bronce 15, plata 30, oro 90, platino 300).
 */
const TROPHY_POINTS: Record<TrophyType, number> = {
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
  const [{ data: psnAccount }, { count: gamesCount }, { data: statsRows }] = await Promise.all([
    supabase
      .from("psn_accounts")
      .select(
        "online_id, avatar_url, trophy_level, trophy_progress, trophy_tier, earned_platinum, earned_gold, earned_silver, earned_bronze",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    // Mismo criterio que /juegos: los juegos de catálogo (alta desde "Marcar
    // como terminado") no cuentan como parte de la biblioteca.
    supabase
      .from("user_games")
      .select("game_id, games!inner (source)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .neq("games.source", "catalog"),
    supabase.rpc("get_library_trophy_stats"),
  ]);

  const counts: Record<TrophyType, number> = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
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
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-8 sm:py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {psnAccount?.avatar_url ? (
              <Image
                src={psnAccount.avatar_url}
                alt={psnAccount.online_id}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-500">
                Sin avatar
              </div>
            )}
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">Perfil</h1>
              <p className="font-mono text-sm text-zinc-400">{user.email}</p>
            </div>
          </div>
          <form action={logout}>
            <Button type="submit" variant="secondary">
              Cerrar sesión
            </Button>
          </form>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Nivel de trofeos" value={level} className="col-span-2 sm:col-span-2">
            <ProgressBar percent={progressPercent} />
          </StatCard>
          <StatCard label="Juegos en biblioteca" value={gamesCount ?? 0} />
          <StatCard label="Trofeos totales" value={totalTrophies} />
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Trofeos por tipo</h2>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/juegos"
            className="block w-full rounded bg-blue-600 px-4 py-2 text-center font-medium text-white hover:bg-blue-500"
          >
            Mi biblioteca
          </Link>
          <Link
            href="/psn"
            className="block w-full rounded border border-zinc-700 px-4 py-2 text-center font-medium text-zinc-50 hover:border-blue-500"
          >
            {psnAccount ? `PSN conectada: ${psnAccount.online_id}` : "Conectar cuenta PSN"}
          </Link>
        </div>
      </div>
    </div>
  );
}
