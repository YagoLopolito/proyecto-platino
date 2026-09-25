import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getGameCardData,
  toCardData,
  GAME_CARD_COLUMNS,
  type GameCardData,
} from "@/lib/catalog/details";
import { getGameStudios } from "@/lib/studios/store";
import { getGameDiarySummary, type GameDiarySummaryOutcome } from "@/lib/diary/queries";

/**
 * Datos de la ficha de juego unificada (epic #183, issue #186).
 *
 * La ficha es un `layout.tsx` (hero + panel de acciones + tabs) con una página
 * por tab. El layout y la página se renderizan en el mismo request y los dos
 * necesitan el juego, la sesión y los trofeos: `cache()` de React hace que
 * cada consulta corra una sola vez por request aunque la pidan los dos. Al
 * cambiar de tab, Next sólo renderiza la página nueva y el layout no se vuelve
 * a pedir.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Cuánto espera la ficha a que se completen los datos externos (RAWG,
 * SteamGridDB, IGDB, la descripción por IA) la primera vez que alguien la
 * abre. Pasado eso se muestra con lo que ya hay en la fila y la consulta
 * termina en segundo plano (`after`): guarda en caché y la próxima visita ya
 * sale completa. Sin tope, abrir un juego nuevo desde el buscador podía
 * tardar varios segundos esperando a proveedores lentos.
 */
const CARD_DATA_BUDGET_MS = 2500;

export interface GamePageBase {
  supabase: SupabaseServerClient;
  userId: string;
  gameId: string;
  card: GameCardData;
  source: string;
  /**
   * El juego está en la biblioteca de quien mira. Ya no es condición para ver
   * la ficha (cualquier juego tiene ficha), pero sí para lo que depende de tu
   * progreso: trofeos y advisor.
   */
  isMember: boolean;
  playtimeMinutes: number | null;
}

/** Sesión + juego + caché de catálogo. `notFound()` si el juego no existe. */
export const getGamePageBase = cache(async (gameId: string): Promise<GamePageBase> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // `games` es de lectura pública (policy `games_select_all`): la ficha ya no
  // pasa por `user_games`. Lo que sí es de cada uno es la fila de `user_games`,
  // que dice si el juego está en tu biblioteca y cuántas horas le jugaste.
  const [{ data: game }, { data: userGame }, storedStudios] = await Promise.all([
    supabase.from("games").select(`${GAME_CARD_COLUMNS}, source`).eq("id", gameId).maybeSingle(),
    supabase
      .from("user_games")
      .select("playtime_minutes")
      .eq("user_id", user.id)
      .eq("game_id", gameId)
      .maybeSingle(),
    getGameStudios(supabase, gameId),
  ]);
  if (!game) notFound();

  const pending = getGameCardData(supabase, game);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fetched = await Promise.race([
    pending,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CARD_DATA_BUDGET_MS);
    }),
  ]).then((result) => {
    clearTimeout(timer);
    if (result) return result;
    // Que termine (y guarde el caché) después de responder.
    after(() => pending.then(() => undefined));
    return toCardData(game);
  });
  // Los estudios recién traídos de IGDB (primera visita) ganan a los guardados.
  const card = {
    ...fetched,
    studios: fetched.studios.length > 0 ? fetched.studios : storedStudios,
  };

  return {
    supabase,
    userId: user.id,
    gameId,
    card,
    source: game.source,
    isMember: userGame !== null,
    playtimeMinutes: userGame?.playtime_minutes ?? null,
  };
});

export interface GameTrophy {
  id: string;
  name: string;
  description: string | null;
  type: string;
  hidden: boolean;
  icon_url: string | null;
  trophy_group_id: string | null;
  rarity: number | null;
  earned_rate: number | null;
  progress_target: string | null;
  obtained: boolean;
}

export interface GameTrophyProgress {
  trophies: GameTrophy[];
  groups: { group_id: string; name: string | null }[];
  error: string | null;
  total: number;
  obtainedCount: number;
  percent: number;
  /** El juego tiene platino (decide la etiqueta del tiempo de completitud). */
  hasPlatinumTrophy: boolean;
  /** Vos lo platinaste (PSN). */
  isPlatinumed: boolean;
  /** Vos lo completaste al 100% (Steam, que no tiene platino). */
  isCompleted: boolean;
}

/**
 * Trofeos del juego cruzados con los tuyos. `user_trophies` se filtra por los
 * trofeos de ESTE juego (no se traen los de toda la cuenta, ver la sección de
 * performance de CLAUDE.md).
 */
export const getGameTrophyProgress = cache(async (gameId: string): Promise<GameTrophyProgress> => {
  const { supabase, userId, source } = await getGamePageBase(gameId);

  const [{ data: trophyRows, error }, { data: groups }] = await Promise.all([
    supabase
      .from("trophies")
      .select(
        "id, name, description, type, hidden, icon_url, trophy_group_id, rarity, earned_rate, progress_target",
      )
      .eq("game_id", gameId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase.from("trophy_groups").select("group_id, name").eq("game_id", gameId),
  ]);

  const rows = trophyRows ?? [];
  const ids = rows.map((row) => row.id);
  const { data: unlocked } = ids.length
    ? await supabase
        .from("user_trophies")
        .select("trophy_id")
        .eq("user_id", userId)
        .in("trophy_id", ids)
    : { data: [] as { trophy_id: string }[] };

  const obtained = new Set((unlocked ?? []).map((row) => row.trophy_id));
  const trophies = rows.map((row) => ({ ...row, obtained: obtained.has(row.id) }));
  const total = trophies.length;
  const obtainedCount = trophies.filter((trophy) => trophy.obtained).length;
  const isSteam = source === "steam";

  return {
    trophies,
    groups: groups ?? [],
    error: error?.message ?? null,
    total,
    obtainedCount,
    percent: total > 0 ? Math.round((obtainedCount / total) * 100) : 0,
    hasPlatinumTrophy: trophies.some((trophy) => trophy.type === "platinum"),
    // Steam no tiene platino: su equivalente es el 100%, con su propio badge.
    isPlatinumed: !isSteam && trophies.some((t) => t.type === "platinum" && t.obtained),
    isCompleted: isSteam && total > 0 && obtainedCount === total,
  };
});

/** Score comunitario, distribución y tus partidas (lo usa el panel de acciones). */
export const getGameDiary = cache(async (gameId: string): Promise<GameDiarySummaryOutcome> => {
  const { supabase, userId } = await getGamePageBase(gameId);
  return getGameDiarySummary(supabase, gameId, userId);
});
