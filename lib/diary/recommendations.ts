import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isVisibleInLibrary } from "@/lib/library/visibility";
import { aiRecommendationsSchema, type AiRecommendations } from "@/lib/ai";
import type { Database } from "@/lib/supabase/database.types";

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

/** Un juego que el usuario jugó: la señal de gusto que va al prompt. */
export type RecommendationPlayedGame = {
  id: string;
  name: string;
  platform: string | null;
  /** Puntaje del diario (0-10), si lo cargó. */
  rating: number | null;
  /** Horas jugadas (PSN o Steam), si se conocen. */
  hours: number | null;
  /** % de trofeos/logros, o null si el juego no tiene ninguno sincronizado. */
  percent: number | null;
  /** Platino de PSN, 100% de logros, o entrada en el diario como terminado. */
  finished: boolean;
};

export type RecommendationCandidates = {
  /** Platinados (PSN) o al 100% (Steam): la muestra de gusto que va al prompt. */
  platinums: { id: string; name: string; platform: string | null; rating: number | null }[];
  /**
   * Todo lo que jugó (horas, logros o entrada en el diario), de PSN, Steam y
   * catálogo: incluye los platinados. Ordenado por cuánto dice del gusto:
   * primero lo que puntuó, después lo que más jugó.
   */
  played: RecommendationPlayedGame[];
  /** Empezados y sin completar: los candidatos a "seguir jugando". */
  library: RecommendationGame[];
  /** Nombres de TODOS los juegos que tiene o jugó, incluidos los que no se ven en la biblioteca. */
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
 * Junta el input del recomendador desde la biblioteca sincronizada y el
 * diario: qué platinó y qué jugó (definen el gusto), qué tiene empezado sin
 * platinar (lo que puede retomar) y qué juegos ya tiene (para no
 * recomendárselos como novedad).
 *
 * Un juego cuenta como "platinado o al 100%" si tiene el platino de PSN o si
 * completó todos sus logros: Steam no tiene platino y el equivalente es el
 * 100% (ver CLAUDE.md, sección de Steam).
 *
 * Los juegos del catálogo marcados como terminados desde el diario no están en
 * `user_games` (solo en `game_diary_entries`), así que se leen aparte: son
 * juegos que el usuario jugó y valoró, y sin ellos el modelo no sabe que
 * existieron.
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
    supabase
      .from("game_diary_entries")
      .select("game_id, rating, games!inner (id, name, platform)")
      .eq("user_id", userId),
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
  // Un juego con entrada en el diario (aunque sin puntaje) igual cuenta como jugado.
  const diaryGameIds = new Set((diaryRatings ?? []).map((row) => row.game_id));

  const platinums: RecommendationCandidates["platinums"] = [];
  const played: RecommendationPlayedGame[] = [];
  const inProgress: RecommendationGame[] = [];
  const ownedNames: string[] = [];
  const seenGameIds = new Set<string>();

  for (const row of library ?? []) {
    const game = row.games;
    if (!game) continue;
    seenGameIds.add(game.id);

    // Todo lo que tiene va a la lista de exclusión, se vea o no en la
    // biblioteca: un free-to-play nunca abierto igual no hay que
    // recomendárselo como "nuevo".
    ownedNames.push(game.name);

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

    const rating = ratingByGame.get(game.id) ?? null;
    const completed = stats.total > 0 && (stats.platinum > 0 || stats.obtained >= stats.total);
    const inDiary = diaryGameIds.has(game.id);
    const wasPlayed =
      completed || inDiary || stats.obtained > 0 || (row.playtime_minutes ?? 0) > 0;

    if (wasPlayed) {
      played.push({
        id: game.id,
        name: game.name,
        platform: game.platform,
        rating,
        hours: row.playtime_minutes ? Math.round(row.playtime_minutes / 60) : null,
        percent: stats.total > 0 ? Math.round((stats.obtained / stats.total) * 100) : null,
        finished: completed || inDiary,
      });
    }

    if (completed) {
      platinums.push({ id: game.id, name: game.name, platform: game.platform, rating });
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

  // Juegos del catálogo terminados desde el diario: no pasan por `user_games`.
  for (const entry of diaryRatings ?? []) {
    const game = entry.games;
    if (!game || seenGameIds.has(game.id)) continue;
    seenGameIds.add(game.id);
    ownedNames.push(game.name);
    played.push({
      id: game.id,
      name: game.name,
      platform: game.platform,
      rating: ratingByGame.get(game.id) ?? null,
      hours: null,
      percent: null,
      finished: true,
    });
  }

  inProgress.sort((a, b) => b.percent - a.percent);
  played.sort(comparePlayedSignal);

  return {
    platinums,
    played,
    library: inProgress.slice(0, MAX_LIBRARY_CANDIDATES),
    ownedNames,
  };
}

/**
 * Qué juego dice más del gusto del usuario: un puntaje explícito le gana a
 * cualquier inferencia; después, lo terminado; después, las horas y el avance.
 */
function comparePlayedSignal(a: RecommendationPlayedGame, b: RecommendationPlayedGame): number {
  if ((a.rating !== null) !== (b.rating !== null)) return a.rating !== null ? -1 : 1;
  if (a.rating !== null && b.rating !== null && a.rating !== b.rating) return b.rating - a.rating;
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  const hoursDiff = (b.hours ?? 0) - (a.hours ?? 0);
  if (hoursDiff !== 0) return hoursDiff;
  return (b.percent ?? 0) - (a.percent ?? 0);
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
 *
 * `knownStats`: las filas de `get_library_trophy_stats()` si el caller ya las
 * tiene (la biblioteca), para no correr dos veces la consulta más cara.
 */
export async function getCachedRecommendations(
  supabase: SupabaseServerClient,
  userId: string,
  knownStats?: Database["public"]["Functions"]["get_library_trophy_stats"]["Returns"],
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
      knownStats ? { data: knownStats } : supabase.rpc("get_library_trophy_stats"),
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
