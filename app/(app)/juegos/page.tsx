import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GamesLibrary, { type LibraryGame } from "./GamesLibrary";
import type { PsnTrophyType } from "@/components/TrophyTypeIcon";
import { ErrorState } from "@/components/ErrorState";
import { SyncStatusBadge, type SyncTokenStatus } from "@/components/SyncStatusBadge";
import { isVisibleInLibrary } from "@/lib/library/visibility";
import SyncButton from "@/components/psn/SyncButton";

type GameStats = {
  total: number;
  obtained: number;
  percent: number;
  counts: Record<PsnTrophyType, number>;
};

export default async function JuegosPage() {
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
  const [{ data: psnAccount }, { data: library, error }, { data: statsRows }] = await Promise.all([
    supabase.from("psn_accounts").select("token_status, last_synced_at").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_games")
      .select(
        "added_at, last_played_at, playtime_minutes, games (id, name, platform, cover_url, icon_url, source)",
      )
      .order("last_played_at", { ascending: false, nullsFirst: false })
      .order("added_at", { ascending: false }),
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
  const games: LibraryGame[] = (library ?? [])
    .flatMap((row) => {
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
      };
    });

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-8 sm:py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Mi biblioteca</h1>
            {psnAccount && <SyncStatusBadge status={psnAccount.token_status as SyncTokenStatus} />}
          </div>
          <p className="text-sm text-zinc-400">
            {psnAccount ? (
              <>
                {psnAccount.last_synced_at
                  ? `Última sincronización: ${new Date(psnAccount.last_synced_at).toLocaleString("es-AR")}.`
                  : "Todavía no se sincronizó ningún juego."}{" "}
                {psnAccount.token_status !== "valid" && (
                  <>
                    Reconectá tu cuenta para seguir sincronizando.{" "}
                    <Link href="/configuracion/conexiones#reconectar-psn" className="text-blue-400 hover:underline">
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

        {error && <ErrorState message={`No se pudo cargar la biblioteca: ${error.message}`} />}

        {!error && <GamesLibrary games={games} />}
      </div>
    </div>
  );
}
