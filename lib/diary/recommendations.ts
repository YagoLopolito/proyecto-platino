import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isVisibleInLibrary } from "@/lib/library/visibility";
import { aiRecommendationsSchema, type AiRecommendations } from "@/lib/ai";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Un juego de la biblioteca, con lo mínimo para rankearlo y para mostrarlo. */
export type RecommendationGame = {
  id: string;
  name: string;
  platform: string | null;
  imageUrl: string | null;
  obtained: number;
  total: number;
  percent: number;
};

export type RecommendationCandidates = {
  /** Platinados (PSN) o al 100% (Steam): la muestra de gusto que va al prompt. */
  platinums: { id: string; name: string; platform: string | null; rating: number | null }[];
  /** Empezados y sin completar: los candidatos a "seguir jugando". */
  library: RecommendationGame[];
  ownedNames: string[];
};

/**
 * Cuántos juegos en curso se le ofrecen al modelo para elegir. La biblioteca
 * real del usuario puede tener cientos: mandarlos todos revienta el límite de
 * tokens del free tier de Groq. Se mandan los más avanzados, que son también
 * los que más sentido tiene retomar.
 */
const MAX_LIBRARY_CANDIDATES = 30;

/**
 * Junta el input del recomendador desde la biblioteca sincronizada: qué
 * platinó (define el gusto), qué tiene empezado sin platinar (lo que puede
 * retomar) y qué juegos ya tiene (para no recomendárselos como novedad).
 *
 * Un juego cuenta como "platinado o al 100%" si tiene el platino de PSN o si
 * completó todos sus logros: Steam no tiene platino y el equivalente es el
 * 100% (ver CLAUDE.md, sección de Steam).
 */
export async function getRecommendationCandidates(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<RecommendationCandidates> {
  const [{ data: library }, { data: statsRows }, { data: diaryRatings }] = await Promise.all([
    supabase
      .from("user_games")
      .select("playtime_minutes, games!inner (id, name, platform, cover_url, icon_url, source)")
      .eq("user_id", userId),
    supabase.rpc("get_library_trophy_stats"),
    supabase.from("game_diary_entries").select("game_id, rating").eq("user_id", userId),
  ]);

  const statsByGame = new Map(
    (statsRows ?? []).map((row) => [
      row.game_id,
      { total: row.total, obtained: row.obtained, platinum: row.platinum },
    ]),
  );
  // Última valoración cargada de cada juego: el orden de las filas alcanza
  // porque solo se usa como señal de gusto para el prompt, no para un promedio.
  const ratingByGame = new Map(
    (diaryRatings ?? []).flatMap((row) => (row.rating === null ? [] : [[row.game_id, row.rating]])),
  );

  const platinums: RecommendationCandidates["platinums"] = [];
  const inProgress: RecommendationGame[] = [];
  const ownedNames: string[] = [];

  for (const row of library ?? []) {
    const game = row.games;
    if (!game) continue;

    const stats = statsByGame.get(game.id) ?? { total: 0, obtained: 0, platinum: 0 };
    if (
      !isVisibleInLibrary({
        source: game.source,
        playtimeMinutes: row.playtime_minutes,
        obtained: stats.obtained,
      })
    ) {
      continue;
    }

    ownedNames.push(game.name);

    const completed = stats.total > 0 && (stats.platinum > 0 || stats.obtained >= stats.total);
    if (completed) {
      platinums.push({
        id: game.id,
        name: game.name,
        platform: game.platform,
        rating: ratingByGame.get(game.id) ?? null,
      });
      continue;
    }

    // Un juego sin trofeos sincronizados todavía no tiene nada que "seguir":
    // no se puede estimar cuánto le falta ni si lo empezó.
    if (stats.total === 0) continue;

    inProgress.push({
      id: game.id,
      name: game.name,
      platform: game.platform,
      imageUrl: game.cover_url ?? game.icon_url,
      obtained: stats.obtained,
      total: stats.total,
      percent: Math.round((stats.obtained / stats.total) * 100),
    });
  }

  inProgress.sort((a, b) => b.percent - a.percent);

  return { platinums, library: inProgress.slice(0, MAX_LIBRARY_CANDIDATES), ownedNames };
}

export type CachedRecommendations = {
  recommendations: AiRecommendations;
  /** Los juegos de `seguir_jugando`, resueltos para poder mostrar carátula y progreso. */
  gamesById: Map<string, RecommendationGame>;
  createdAt: string;
};

/**
 * Última generación `ok` del usuario (versionado: cada corrida inserta una fila
 * nueva, ver la migración 20260826000000). Devuelve null si nunca generó
 * ninguna, o si la guardada ya no matchea el schema actual -- en ese caso la UI
 * simplemente ofrece regenerar en vez de romper la página.
 */
export async function getCachedRecommendations(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<CachedRecommendations | null> {
  const { data: row } = await supabase
    .from("ai_recommendations")
    .select("payload_json, created_at")
    .eq("user_id", userId)
    .eq("status", "ok")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return null;

  const parsed = aiRecommendationsSchema.safeParse(row.payload_json);
  if (!parsed.success) return null;

  const gameIds = parsed.data.seguir_jugando.map((item) => item.juego_id);
  const gamesById = new Map<string, RecommendationGame>();

  if (gameIds.length > 0) {
    const [{ data: games }, { data: statsRows }] = await Promise.all([
      supabase.from("games").select("id, name, platform, cover_url, icon_url").in("id", gameIds),
      supabase.rpc("get_library_trophy_stats"),
    ]);
    const statsByGame = new Map((statsRows ?? []).map((r) => [r.game_id, r]));

    for (const game of games ?? []) {
      const stats = statsByGame.get(game.id);
      const total = stats?.total ?? 0;
      const obtained = stats?.obtained ?? 0;
      gamesById.set(game.id, {
        id: game.id,
        name: game.name,
        platform: game.platform,
        imageUrl: game.cover_url ?? game.icon_url,
        obtained,
        total,
        percent: total > 0 ? Math.round((obtained / total) * 100) : 0,
      });
    }
  }

  return { recommendations: parsed.data, gamesById, createdAt: row.created_at };
}
