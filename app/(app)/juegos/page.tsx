import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GamesLibrary, { type LibraryGame } from "./GamesLibrary";
import type { TrophyType } from "@/components/TrophyTypeIcon";
import { ErrorState } from "@/components/ErrorState";

type GameStats = {
  total: number;
  obtained: number;
  percent: number;
  counts: Record<TrophyType, number>;
};

export default async function JuegosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: library, error } = await supabase
    .from("user_games")
    .select("added_at, last_played_at, games (id, name, platform, cover_url, icon_url)")
    .order("last_played_at", { ascending: false, nullsFirst: false })
    .order("added_at", { ascending: false });

  const gameIds = (library ?? []).map((row) => row.games?.id).filter((id): id is string => !!id);

  const statsByGame = new Map<string, GameStats>();

  if (gameIds.length > 0) {
    const PAGE_SIZE = 1000;
    const trophies: { id: string; game_id: string; type: string }[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page } = await supabase
        .from("trophies")
        .select("id, game_id, type")
        .in("game_id", gameIds)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      trophies.push(...(page ?? []));
      if (!page || page.length < PAGE_SIZE) break;
    }

    const userTrophies: { trophy_id: string }[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page } = await supabase
        .from("user_trophies")
        .select("trophy_id")
        .eq("user_id", user.id)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      userTrophies.push(...(page ?? []));
      if (!page || page.length < PAGE_SIZE) break;
    }

    const obtainedIds = new Set(userTrophies.map((row) => row.trophy_id));

    for (const gameId of gameIds) {
      statsByGame.set(gameId, {
        total: 0,
        obtained: 0,
        percent: 0,
        counts: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
      });
    }

    for (const trophy of trophies ?? []) {
      const stats = statsByGame.get(trophy.game_id);
      if (!stats) continue;
      stats.total += 1;
      const obtained = obtainedIds.has(trophy.id);
      if (obtained) {
        stats.obtained += 1;
        if (trophy.type in stats.counts) {
          stats.counts[trophy.type as TrophyType] += 1;
        }
      }
    }

    for (const stats of statsByGame.values()) {
      stats.percent = stats.total > 0 ? Math.round((stats.obtained / stats.total) * 100) : 0;
    }
  }

  const games: LibraryGame[] = (library ?? [])
    .filter((row) => row.games)
    .map((row) => {
      const game = row.games!;
      const stats = statsByGame.get(game.id) ?? {
        total: 0,
        obtained: 0,
        percent: 0,
        counts: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
      };

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
      };
    });

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Mi biblioteca</h1>
          <p className="text-sm text-zinc-400">
            Tus juegos y trofeos se traen automáticamente desde tu cuenta PSN.{" "}
            <Link href="/psn" className="text-blue-400 hover:underline">
              Sincronizar ahora
            </Link>
            .
          </p>
        </div>

        {error && <ErrorState message={`No se pudo cargar la biblioteca: ${error.message}`} />}

        {!error && <GamesLibrary games={games} />}
      </div>
    </div>
  );
}
