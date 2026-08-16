import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthorizationFromNpsso } from "./auth";
import { decryptSecret } from "./crypto";
import { NpssoExpiredError } from "./errors";
import { fetchUserTitlesWithTrophies } from "./trophies";

export type SyncResult = {
  titlesSynced: number;
  trophiesSynced: number;
};

/**
 * Sincroniza los juegos y trofeos de la cuenta PSN vinculada al usuario:
 * intercambia el NPSSO guardado por tokens frescos, trae todos los títulos
 * con sus trofeos desde la PSN API, y hace upsert en games/trophies/user_trophies.
 */
export async function syncTrophiesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncResult> {
  const { data: psnAccount, error: psnAccountError } = await supabase
    .from("psn_accounts")
    .select("id, npsso_encrypted")
    .eq("user_id", userId)
    .single();

  if (psnAccountError || !psnAccount) {
    throw new Error("No hay una cuenta PSN vinculada para este usuario.");
  }

  const npsso = decryptSecret(psnAccount.npsso_encrypted);

  let authorization;
  try {
    authorization = await getAuthorizationFromNpsso(npsso);
  } catch (error) {
    await supabase
      .from("psn_accounts")
      .update({ token_status: "invalid" })
      .eq("id", psnAccount.id);
    throw error instanceof NpssoExpiredError ? error : new NpssoExpiredError(error);
  }

  const titles = await fetchUserTitlesWithTrophies(authorization);

  let trophiesSynced = 0;

  for (const { title, trophies } of titles) {
    const { data: game, error: gameError } = await supabase
      .from("games")
      .upsert(
        {
          np_comm_id: title.npCommunicationId,
          name: title.trophyTitleName,
          platform: title.trophyTitlePlatform,
          icon_url: title.trophyTitleIconUrl,
        },
        { onConflict: "np_comm_id" },
      )
      .select("id")
      .single();

    if (gameError || !game) {
      throw new Error(`No se pudo guardar el juego ${title.trophyTitleName}: ${gameError?.message}`);
    }

    for (const trophy of trophies) {
      const { data: trophyRow, error: trophyError } = await supabase
        .from("trophies")
        .upsert(
          {
            game_id: game.id,
            trophy_id: String(trophy.trophyId),
            name: trophy.trophyName ?? "Trofeo oculto",
            description: trophy.trophyDetail ?? null,
            type: trophy.trophyType,
            icon_url: trophy.trophyIconUrl ?? null,
            hidden: trophy.trophyHidden,
          },
          { onConflict: "game_id,trophy_id" },
        )
        .select("id")
        .single();

      if (trophyError || !trophyRow) {
        throw new Error(`No se pudo guardar el trofeo ${trophy.trophyId}: ${trophyError?.message}`);
      }

      if (trophy.earned) {
        const { error: userTrophyError } = await supabase.from("user_trophies").upsert(
          {
            user_id: userId,
            trophy_id: trophyRow.id,
            unlocked_at: trophy.earnedDateTime ?? null,
          },
          { onConflict: "user_id,trophy_id" },
        );

        if (userTrophyError) {
          throw new Error(`No se pudo guardar el progreso del trofeo: ${userTrophyError.message}`);
        }
      }

      trophiesSynced += 1;
    }
  }

  await supabase
    .from("psn_accounts")
    .update({ token_status: "valid", last_synced_at: new Date().toISOString() })
    .eq("id", psnAccount.id);

  return { titlesSynced: titles.length, trophiesSynced };
}
