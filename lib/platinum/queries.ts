import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { NEAR_PLATINUM_MIN_PERCENT, selectNearPlatinum } from "@/lib/library/near-platinum";
import type { PlatinumPiece } from "./stats";
import { DEFAULT_PLATINUM_PREFS, type PlatinumPrefs } from "./types";

type Client = SupabaseClient<Database>;

/**
 * La colección de platinos de quien mira, del primero al último, con su número
 * y su rareza. Un solo RPC (`get_platinum_collection`, security invoker): la
 * vitrina, la ficha y la celebración salen de la misma cuenta.
 */
export async function getPlatinumCollection(supabase: Client): Promise<PlatinumPiece[]> {
  const { data, error } = await supabase.rpc("get_platinum_collection");
  if (error) {
    console.error("[platino] no se pudo leer la colección:", error.message);
    return [];
  }
  return (data ?? []).map(toPiece);
}

type CollectionRow = Database["public"]["Functions"]["get_platinum_collection"]["Returns"][number];

function toPiece(row: CollectionRow): PlatinumPiece {
  return {
    userTrophyId: row.user_trophy_id,
    gameId: row.game_id,
    name: row.name,
    imageUrl: row.cover_url ?? row.icon_url,
    unlockedAt: row.unlocked_at,
    // `numeric` puede llegar como string según la versión de PostgREST.
    earnedRate: row.earned_rate === null ? null : Number(row.earned_rate),
    firstUnlockedAt: row.first_unlocked_at,
    number: row.platinum_number,
  };
}

/**
 * Platinos nuevos todavía sin celebrar, del más viejo al más nuevo (la cola de
 * la celebración). Primero una consulta barata contra el índice parcial
 * `user_trophies_uncelebrated`: casi siempre no hay nada y no vale la pena
 * armar la colección entera en cada apertura de la app.
 */
export async function getPendingCelebrations(
  supabase: Client,
  userId: string,
): Promise<PlatinumPiece[]> {
  const { data: pending } = await supabase
    .from("user_trophies")
    .select("id")
    .eq("user_id", userId)
    .is("celebrated_at", null)
    .limit(50);
  if (!pending || pending.length === 0) return [];

  const ids = new Set(pending.map((row) => row.id));
  const { data } = await supabase.rpc("get_platinum_collection");
  return (data ?? []).filter((row) => ids.has(row.user_trophy_id)).map(toPiece);
}

export async function getPlatinumPrefs(supabase: Client, userId: string): Promise<PlatinumPrefs> {
  const { data } = await supabase
    .from("users")
    .select("platinum_sound_enabled, platinum_effects_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return DEFAULT_PLATINUM_PREFS;
  return { sound: data.platinum_sound_enabled, effects: data.platinum_effects_enabled };
}

/** Marca como celebrado un platino propio (la RLS exige que la fila sea tuya). */
export async function markCelebrated(
  supabase: Client,
  userId: string,
  userTrophyId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("user_trophies")
    .update({ celebrated_at: new Date().toISOString() })
    .eq("id", userTrophyId)
    .eq("user_id", userId)
    .is("celebrated_at", null);
  return !error;
}

export interface NextPlatinumCandidate {
  gameId: string;
  name: string;
  imageUrl: string | null;
  percent: number;
}

type LibraryStatsRow =
  Database["public"]["Functions"]["get_library_trophy_stats"]["Returns"][number];

/**
 * "Tu próximo platino": los juegos de PSN más cerca de platinar, con el mismo
 * criterio que la fila "Cerca del platino" de la biblioteca
 * (`selectNearPlatinum`). Recibe las stats si quien llama ya corrió el RPC.
 */
export async function getNextPlatinumCandidates(
  supabase: Client,
  stats: LibraryStatsRow[],
  limit: number,
): Promise<NextPlatinumCandidate[]> {
  const byGame = new Map(stats.map((row) => [row.game_id, row]));
  // Se recorta antes de consultar los juegos: así el `in (...)` lleva un
  // puñado de ids y no la biblioteca entera.
  const candidates = stats.filter(
    (row) =>
      row.total > 0 &&
      row.platinum === 0 &&
      row.obtained < row.total &&
      (row.obtained / row.total) * 100 > NEAR_PLATINUM_MIN_PERCENT,
  );
  if (candidates.length === 0) return [];

  const { data } = await supabase
    .from("games")
    .select("id, name, cover_url, icon_url, source")
    .in(
      "id",
      candidates.map((row) => row.game_id),
    )
    .neq("source", "steam");

  const games = (data ?? []).flatMap((game) => {
    const row = byGame.get(game.id);
    if (!row) return [];
    return {
      gameId: game.id,
      name: game.name,
      imageUrl: game.cover_url ?? game.icon_url,
      source: game.source,
      total: row.total,
      obtained: row.obtained,
      percent: Math.round((row.obtained / row.total) * 100),
      platinumObtained: row.platinum,
    };
  });

  return selectNearPlatinum(games, limit).map(({ gameId, name, imageUrl, percent }) => ({
    gameId,
    name,
    imageUrl,
    percent,
  }));
}
