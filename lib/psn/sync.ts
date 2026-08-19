import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { findCoverUrl } from "@/lib/covers";
import { getAuthorizationFromNpsso } from "./auth";
import { mapWithConcurrency } from "./concurrency";
import { decryptSecret } from "./crypto";
import { NpssoExpiredError } from "./errors";
import { fetchUserTitlesWithTrophies, type FetchedTitle } from "./trophies";

export type SyncResult = { titlesSynced: number; trophiesSynced: number };

/** Cuántos títulos se procesan en simultáneo contra la base. */
const TITLE_WRITE_CONCURRENCY = 3;

async function resolveGameId(
  supabase: SupabaseClient<Database>,
  userId: string,
  title: FetchedTitle,
): Promise<string | null> {
  const { data: existingGame } = await supabase
    .from("games")
    .select("id")
    .eq("np_comm_id", title.npCommId)
    .maybeSingle();

  if (existingGame) return existingGame.id;

  const coverUrl = await findCoverUrl(title.name);
  const { data: created, error: insertGameError } = await supabase
    .from("games")
    .insert({
      np_comm_id: title.npCommId,
      name: title.name,
      platform: title.platform,
      icon_url: title.iconUrl,
      cover_url: coverUrl,
      created_by: userId,
      source: "psn",
    })
    .select("id")
    .single();

  if (!insertGameError && created) return created.id;

  // Carrera con otro sync insertando el mismo juego -- reintentar la lectura.
  const { data: retryGame } = await supabase
    .from("games")
    .select("id")
    .eq("np_comm_id", title.npCommId)
    .maybeSingle();
  return retryGame?.id ?? null;
}

/**
 * Sincroniza un título completo con el mínimo de round-trips a la base:
 * un select de los trofeos existentes, un upsert en bloque de los que
 * faltan, un select final para mapear ids, y un upsert en bloque de los
 * trofeos ya desbloqueados. Nunca uno por trofeo -- con bibliotecas
 * grandes eso es lo que hacía que el sync superara el timeout de la
 * función serverless.
 */
async function syncTitle(
  supabase: SupabaseClient<Database>,
  userId: string,
  title: FetchedTitle,
): Promise<{ titleSynced: boolean; trophiesSynced: number }> {
  const gameId = await resolveGameId(supabase, userId, title);
  if (!gameId) return { titleSynced: false, trophiesSynced: 0 };

  await supabase
    .from("user_games")
    .upsert(
      { user_id: userId, game_id: gameId, last_played_at: title.lastPlayedAt },
      { onConflict: "user_id,game_id" },
    );

  if (title.trophies.length === 0) {
    return { titleSynced: true, trophiesSynced: 0 };
  }

  const rows = title.trophies.map((trophy) => ({
    game_id: gameId,
    trophy_id: String(trophy.npTrophyId),
    name: trophy.name,
    description: trophy.description,
    type: trophy.type,
    icon_url: trophy.iconUrl,
    hidden: trophy.hidden,
    sort_order: trophy.sortOrder,
    trophy_group_id: trophy.groupId,
    created_by: userId,
  }));

  // ON CONFLICT DO UPDATE (no ignoreDuplicates): permite que un re-sync
  // backfillee columnas nuevas (ej. trophy_group_id) en filas ya sincronizadas
  // por el mismo usuario. Si el juego lo sincronizó otro usuario antes, la
  // policy "trophies_update_own" bloquea la escritura sobre esas filas
  // silenciosamente (RLS), así que no rompe nada -- sus filas quedan tal cual.
  await supabase.from("trophies").upsert(rows, { onConflict: "game_id,trophy_id" });

  const { data: allTrophies } = await supabase
    .from("trophies")
    .select("id, trophy_id")
    .eq("game_id", gameId);

  const trophyIdByNpId = new Map((allTrophies ?? []).map((t) => [t.trophy_id, t.id]));

  const earnedRows = title.trophies
    .filter((t) => t.earned)
    .map((t) => ({
      user_id: userId,
      trophy_id: trophyIdByNpId.get(String(t.npTrophyId)),
      unlocked_at: t.earnedAt,
    }))
    .filter((row): row is { user_id: string; trophy_id: string; unlocked_at: string | null } =>
      Boolean(row.trophy_id),
    );

  if (earnedRows.length > 0) {
    await supabase.from("user_trophies").upsert(earnedRows, { onConflict: "user_id,trophy_id" });
  }

  return { titleSynced: true, trophiesSynced: trophyIdByNpId.size };
}

/**
 * Trae todos los juegos y trofeos reales del usuario desde PSN y los guarda.
 *
 * Las filas de `games`/`trophies` que sincroniza un usuario quedan con
 * created_by = ese usuario (source = 'psn'). Las políticas RLS actuales solo
 * dejan actualizar filas propias, así que si el juego/trofeo ya existe (lo
 * sincronizó otro usuario antes) no se reescribe -- sólo se reutiliza su id.
 * Limitación conocida v1: el catálogo compartido queda "de facto" en manos de
 * quien sincronizó primero cada juego.
 */
export async function syncTrophiesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SyncResult> {
  const { data: account, error: accountError } = await supabase
    .from("psn_accounts")
    .select("npsso_encrypted")
    .eq("user_id", userId)
    .single();

  if (accountError || !account) {
    throw new Error("No hay una cuenta PSN conectada para este usuario.");
  }

  const npsso = decryptSecret(account.npsso_encrypted);

  let titles;
  try {
    const authorization = await getAuthorizationFromNpsso(npsso);
    titles = await fetchUserTitlesWithTrophies(authorization);
  } catch (cause) {
    await supabase.from("psn_accounts").update({ token_status: "expired" }).eq("user_id", userId);
    if (cause instanceof NpssoExpiredError) throw cause;
    throw new NpssoExpiredError(cause);
  }

  const results = await mapWithConcurrency(titles, TITLE_WRITE_CONCURRENCY, (title) =>
    syncTitle(supabase, userId, title),
  );

  await supabase
    .from("psn_accounts")
    .update({ token_status: "valid", last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);

  return {
    titlesSynced: results.filter((r) => r.titleSynced).length,
    trophiesSynced: results.reduce((sum, r) => sum + r.trophiesSynced, 0),
  };
}
