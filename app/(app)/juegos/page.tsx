import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GamesLibrary, { type LibraryGame } from "./GamesLibrary";
import type { PsnTrophyType } from "@/components/TrophyTypeIcon";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { SyncStatusBadge, type SyncTokenStatus } from "@/components/SyncStatusBadge";
import { isVisibleInLibrary } from "@/lib/library/visibility";
import SyncButton from "@/components/psn/SyncButton";

type GameStats = {
  total: number;
  obtained: number;
  percent: number;
  counts: Record<PsnTrophyType, number>;
};

/** Fuentes que la biblioteca sabe filtrar. Cualquier otro valor cae a "todas". */
const SOURCE_FILTERS = ["psn", "steam"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number] | "todos";

function parseSourceFilter(raw: string | undefined): SourceFilter {
  return SOURCE_FILTERS.includes(raw as (typeof SOURCE_FILTERS)[number])
    ? (raw as SourceFilter)
    : "todos";
}

const SOURCE_LABEL: Record<SourceFilter, string> = {
  todos: "Todos",
  psn: "PSN",
  steam: "Steam",
};

export default async function JuegosPage({
  searchParams,
}: {
  searchParams: Promise<{ fuente?: string }>;
}) {
  // Query param y no estado de cliente: así el filtro es linkeable, sobrevive
  // al refresh, y sobre todo se puede aplicar en la query de Postgres en vez de
  // traer toda la biblioteca para esconder la mitad en el browser.
  const fuente = parseSourceFilter((await searchParams).fuente);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const userId = user.id;

  // get_library_trophy_stats agrega total/obtenidos por juego con GROUP BY en Postgres
  // (ver migración 20260820020000) en vez de traer miles de filas de trophies/
  // user_trophies a memoria del servidor y sumar en JS con paginado manual -- con
  // bibliotecas grandes eso eran más de 10 round-trips seriales solo para esta página.
  // `games!inner` para poder filtrar por una columna del juego desde
  // `user_games`: sin el inner join, PostgREST devuelve igual la fila con
  // `games: null` en vez de descartarla.
  let libraryQuery = supabase
    .from("user_games")
    .select(
      "added_at, last_played_at, playtime_minutes, games!inner (id, name, platform, cover_url, icon_url, source)",
    )
    .order("last_played_at", { ascending: false, nullsFirst: false })
    .order("added_at", { ascending: false });

  if (fuente !== "todos") {
    libraryQuery = libraryQuery.eq("games.source", fuente);
  }

  const [
    { data: psnAccount },
    { data: steamAccount },
    { data: library, error },
    { data: statsRows },
  ] = await Promise.all([
    supabase
      .from("psn_accounts")
      .select("token_status, last_synced_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("steam_accounts").select("persona_name").eq("user_id", userId).maybeSingle(),
    libraryQuery,
    supabase.rpc("get_library_trophy_stats"),
  ]);

  const statsByGame = new Map<string, GameStats>();
  for (const row of statsRows ?? []) {
    statsByGame.set(row.game_id, {
      total: row.total,
      obtained: row.obtained,
      percent: row.total > 0 ? Math.round((row.obtained / row.total) * 100) : 0,
      counts: { platinum: row.platinum, gold: row.gold, silver: row.silver, bronze: row.bronze },
    });
  }

  // Qué se lista y qué no lo decide `isVisibleInLibrary` (juegos de catálogo y
  // basura de Steam), compartido con /perfil para que los dos cuenten igual.
  const games: LibraryGame[] = (library ?? []).flatMap((row) => {
    const game = row.games;
    if (!game) return [];
    const stats = statsByGame.get(game.id) ?? {
      total: 0,
      obtained: 0,
      percent: 0,
      counts: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
    };

    if (
      !isVisibleInLibrary({
        source: game.source,
        playtimeMinutes: row.playtime_minutes,
        obtained: stats.obtained,
      })
    ) {
      return [];
    }

    return {
      id: game.id,
      name: game.name,
      platform: game.platform,
      imageUrl: game.cover_url ?? game.icon_url,
      addedAt: row.added_at,
      lastPlayedAt: row.last_played_at,
      total: stats.total,
      obtained: stats.obtained,
      percent: stats.percent,
      counts: stats.counts,
      source: game.source,
      playtimeMinutes: row.playtime_minutes,
    };
  });

  return (
    // max-w-5xl (antes 2xl): la biblioteca es una grilla de carátulas, y a
    // 672px de ancho entraban tres columnas con mucho aire muerto a los lados.
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-6 text-zinc-50 sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold sm:text-2xl">Mi biblioteca</h1>
            {psnAccount && <SyncStatusBadge status={psnAccount.token_status as SyncTokenStatus} />}
          </div>
          {/* Texto de estado: chico en mobile, donde compite con la grilla. */}
          <p className="text-xs text-zinc-400 sm:text-sm">
            {psnAccount ? (
              <>
                {psnAccount.last_synced_at
                  ? `Última sincronización: ${new Date(psnAccount.last_synced_at).toLocaleString("es-AR")}.`
                  : "Todavía no se sincronizó ningún juego."}{" "}
                {psnAccount.token_status !== "valid" && (
                  <>
                    Reconectá tu cuenta para seguir sincronizando.{" "}
                    <Link
                      href="/configuracion/conexiones#reconectar-psn"
                      className="text-blue-400 hover:underline"
                    >
                      Reconectar cuenta PSN
                    </Link>
                    .
                  </>
                )}
              </>
            ) : (
              <>
                Tus juegos y trofeos se traen automáticamente desde tu cuenta PSN.{" "}
                <Link href="/configuracion/conexiones" className="text-blue-400 hover:underline">
                  Conectar cuenta
                </Link>
                .
              </>
            )}
          </p>

          {psnAccount?.token_status === "valid" && (
            // Sincronizar desde la propia biblioteca: antes esto era un link
            // que te mandaba a /psn solo para apretar el botón.
            <SyncButton reconnectHref="/configuracion/conexiones#reconectar-psn" />
          )}
        </div>

        {/* El selector solo tiene sentido con las dos plataformas conectadas:
            con una sola, dos de los tres botones dan vacío siempre. */}
        {psnAccount && steamAccount && (
          <nav
            aria-label="Filtrar por plataforma"
            className="flex flex-wrap items-center gap-1 text-xs"
          >
            {(["todos", ...SOURCE_FILTERS] as SourceFilter[]).map((value) => (
              <Link
                key={value}
                href={value === "todos" ? "/juegos" : `/juegos?fuente=${value}`}
                aria-current={fuente === value ? "page" : undefined}
                className={`rounded-full border px-3 py-1 ${
                  fuente === value
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                }`}
              >
                {SOURCE_LABEL[value]}
              </Link>
            ))}
          </nav>
        )}

        {error && <ErrorState message={`No se pudo cargar la biblioteca: ${error.message}`} />}

        {!error && games.length === 0 && fuente !== "todos" ? (
          <EmptyState
            title={`No tenés juegos de ${SOURCE_LABEL[fuente]} sincronizados. Sincronizá esa cuenta desde Configuración › Conexiones.`}
            action={
              <Link href="/juegos" className="text-blue-400 hover:underline">
                Ver todos los juegos
              </Link>
            }
          />
        ) : (
          !error && <GamesLibrary games={games} />
        )}
      </div>
    </div>
  );
}
