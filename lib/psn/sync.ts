import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { findCoverUrl } from "@/lib/covers";
import { getAuthorizationFromNpsso } from "./auth";
import { decryptSecret } from "./crypto";
import { NpssoExpiredError } from "./errors";
import { fetchUserTitlesWithTrophies } from "./trophies";

export type SyncResult = { titlesSynced: number; trophiesSynced: number };

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

  let titlesSynced = 0;
  let trophiesSynced = 0;

  for (const title of titles) {
    const platform = title.platform;

    const { data: existingGame } = await supabase
      .from("games")
      .select("id")
      .eq("np_comm_id", title.npCommId)
      .maybeSingle();

    let gameId = existingGame?.id;

    if (!gameId) {
      const coverUrl = await findCoverUrl(title.name);
      const { data: created, error: insertGameError } = await supabase
        .from("games")
        .insert({
          np_comm_id: title.npCommId,
          name: title.name,
          platform,
          icon_url: title.iconUrl,
          cover_url: coverUrl,
          created_by: userId,
          source: "psn",
        })
        .select("id")
        .single();

      if (insertGameError || !created) {
        // No se pudo crear (posible carrera con otro sync). Reintentar la lectura.
        const { data: retryGame } = await supabase
          .from("games")
          .select("id")
          .eq("np_comm_id", title.npCommId)
          .maybeSingle();
        if (!retryGame) continue;
        gameId = retryGame.id;
      } else {
        gameId = created.id;
      }
    }

    await supabase.from("user_games").upsert(
      { user_id: userId, game_id: gameId },
      { onConflict: "user_id,game_id", ignoreDuplicates: true },
    );

    titlesSynced++;

    for (const trophy of title.trophies) {
      const npTrophyId = String(trophy.npTrophyId);

      const { data: existingTrophy } = await supabase
        .from("trophies")
        .select("id")
        .eq("game_id", gameId)
        .eq("trophy_id", npTrophyId)
        .maybeSingle();

      let trophyId = existingTrophy?.id;

      if (!trophyId) {
        const { data: createdTrophy, error: insertTrophyError } = await supabase
          .from("trophies")
          .insert({
            game_id: gameId,
            trophy_id: npTrophyId,
            name: trophy.name,
            description: trophy.description,
            type: trophy.type,
            icon_url: trophy.iconUrl,
            hidden: trophy.hidden,
            sort_order: trophy.sortOrder,
            created_by: userId,
          })
          .select("id")
          .single();

        if (insertTrophyError || !createdTrophy) {
          const { data: retryTrophy } = await supabase
            .from("trophies")
            .select("id")
            .eq("game_id", gameId)
            .eq("trophy_id", npTrophyId)
            .maybeSingle();
          if (!retryTrophy) continue;
          trophyId = retryTrophy.id;
        } else {
          trophyId = createdTrophy.id;
        }
      }

      trophiesSynced++;

      if (trophy.earned) {
        await supabase.from("user_trophies").upsert(
          { user_id: userId, trophy_id: trophyId, unlocked_at: trophy.earnedAt },
          { onConflict: "user_id,trophy_id" },
        );
      }
    }
  }

  await supabase
    .from("psn_accounts")
    .update({ token_status: "valid", last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);

  return { titlesSynced, trophiesSynced };
}
