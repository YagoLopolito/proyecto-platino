import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Un juego que alguien está jugando ahora: lo mínimo para una carátula. */
export interface NowPlayingGame {
  id: string;
  name: string;
  imageUrl: string | null;
  startedAt: string;
}

/**
 * Lo que un usuario está jugando ahora, lo último que empezó primero. Sirve
 * para el perfil propio y para el ajeno: `now_playing` es de lectura pública.
 */
export async function getNowPlaying(supabase: Client, userId: string): Promise<NowPlayingGame[]> {
  const { data } = await supabase
    .from("now_playing")
    .select("started_at, games!inner (id, name, cover_url, icon_url)")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false });

  return (data ?? []).flatMap((row) =>
    row.games
      ? [
          {
            id: row.games.id,
            name: row.games.name,
            imageUrl: row.games.cover_url ?? row.games.icon_url,
            startedAt: row.started_at,
          },
        ]
      : [],
  );
}

/** Si el usuario tiene una racha abierta de este juego. */
export async function isPlayingGame(
  supabase: Client,
  userId: string,
  gameId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("now_playing")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .is("ended_at", null);
  return (count ?? 0) > 0;
}

/**
 * Cuántas de las personas que seguís están jugando este juego ahora ("N amigos
 * lo están jugando" en la ficha). La relación de amigos es unidireccional
 * (ver `friendships`): son los que agregaste vos.
 */
export async function countFriendsPlaying(
  supabase: Client,
  userId: string,
  gameId: string,
): Promise<number> {
  const { data: friends } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", userId);
  const friendIds = (friends ?? []).map((row) => row.friend_id);
  if (friendIds.length === 0) return 0;

  const { count } = await supabase
    .from("now_playing")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .is("ended_at", null)
    .in("user_id", friendIds);
  return count ?? 0;
}

type LibraryStatsRow =
  Database["public"]["Functions"]["get_library_trophy_stats"]["Returns"][number];

/** Candidato a "¿Estás jugando X?". */
export interface PlaySuggestion {
  id: string;
  name: string;
  imageUrl: string | null;
  lastPlayedAt: string;
}

/** Cuántos juegos recientes se miran para encontrar un candidato. */
const SUGGESTION_CANDIDATES = 10;

/** El banner de la biblioteca no sugiere juegos que no tocaste en este tiempo. */
export const SUGGESTION_MAX_AGE_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * El último juego abierto según `user_games.last_played_at` (lo llenan los
 * syncs de PSN y Steam) que tenga sentido sugerir como "jugando":
 *
 * - que no esté ya en "Jugando ahora";
 * - que no esté platinado ni al 100% (terminado no es "jugando");
 * - que no lo hayas dejado **después** de la última vez que lo abriste: si
 *   dijiste "Dejé de jugarlo", recién se vuelve a sugerir con una sesión nueva.
 *
 * `forBanner` agrega lo propio del banner de la biblioteca, que aparece solo
 * sin que nadie lo pida: respeta el "Descartar" (hasta un `last_played_at` más
 * nuevo) y no sugiere nada que no hayas tocado en `SUGGESTION_MAX_AGE_DAYS`.
 * El + no lleva esos filtros: ahí el usuario abrió el menú para registrar algo.
 *
 * `stats` son las filas de `get_library_trophy_stats()` si el caller ya las
 * tiene (la biblioteca): así el RPC no corre dos veces en la misma página.
 *
 * `null` si no hay candidato (típicamente, sin cuentas conectadas).
 */
export async function getPlaySuggestion(
  supabase: Client,
  userId: string,
  { forBanner = false, stats: knownStats }: { forBanner?: boolean; stats?: LibraryStatsRow[] } = {},
): Promise<PlaySuggestion | null> {
  const { data: recent } = await supabase
    .from("user_games")
    .select(
      "game_id, last_played_at, play_suggestion_dismissed_at, games!inner (id, name, cover_url, icon_url)",
    )
    .eq("user_id", userId)
    .not("last_played_at", "is", null)
    .order("last_played_at", { ascending: false })
    .limit(SUGGESTION_CANDIDATES);

  const candidates = (recent ?? []).filter(
    (row): row is typeof row & { last_played_at: string } =>
      row.last_played_at !== null && row.games !== null,
  );
  if (candidates.length === 0) return null;

  const ids = candidates.map((row) => row.game_id);
  const [{ data: sessions }, { data: stats }] = await Promise.all([
    supabase
      .from("now_playing")
      .select("game_id, ended_at")
      .eq("user_id", userId)
      .in("game_id", ids),
    // El mismo RPC que la biblioteca: agrega por juego en Postgres. Trae toda
    // la biblioteca, pero es una fila por juego y ya está probado a escala.
    knownStats ? { data: knownStats } : supabase.rpc("get_library_trophy_stats"),
  ]);

  const playing = new Set<string>();
  const lastEndedAt = new Map<string, string>();
  for (const session of sessions ?? []) {
    if (session.ended_at === null) {
      playing.add(session.game_id);
    } else {
      const previous = lastEndedAt.get(session.game_id);
      if (!previous || session.ended_at > previous) {
        lastEndedAt.set(session.game_id, session.ended_at);
      }
    }
  }

  const finished = new Set(
    (stats ?? [])
      .filter((row) => row.platinum > 0 || (row.total > 0 && row.obtained === row.total))
      .map((row) => row.game_id),
  );

  const oldest = Date.now() - SUGGESTION_MAX_AGE_DAYS * MS_PER_DAY;

  const pick = candidates.find((row) => {
    if (playing.has(row.game_id) || finished.has(row.game_id)) return false;
    const ended = lastEndedAt.get(row.game_id);
    if (ended && Date.parse(ended) >= Date.parse(row.last_played_at)) return false;
    if (!forBanner) return true;
    if (Date.parse(row.last_played_at) < oldest) return false;
    const dismissed = row.play_suggestion_dismissed_at;
    return !dismissed || Date.parse(row.last_played_at) > Date.parse(dismissed);
  });

  if (!pick?.games) return null;
  return {
    id: pick.games.id,
    name: pick.games.name,
    imageUrl: pick.games.cover_url ?? pick.games.icon_url,
    lastPlayedAt: pick.last_played_at,
  };
}
