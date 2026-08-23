import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { findCoverUrl } from "@/lib/covers";
import { mapWithConcurrency } from "@/lib/psn/concurrency";
import { fetchGameAchievements } from "./achievements";
import { getSteamCallCount } from "./client";
import { SteamApiError, SteamProfilePrivateError } from "./errors";
import { getOwnedGames, type SteamOwnedGame } from "./library";
import { getPlayerSummary } from "./profile";

export type SteamSyncResult = {
  titlesSynced: number;
  achievementsSynced: number;
  /** Juegos que se registraron en la biblioteca pero no tienen logros. */
  titlesWithoutAchievements: number;
};

/** Mismo criterio que el sync de PSN: pocos títulos en vuelo a la vez. */
const TITLE_CONCURRENCY = 3;

/**
 * Steam publica el % global de cada logro; la app ya guarda `rarity` en la
 * escala de PSN (0=ultra rara .. 3=común) y la UI la pinta con esa escala, así
 * que traducimos el porcentaje a los mismos cuatro tramos en vez de inventar
 * una segunda escala que la UI no sabría leer.
 */
function rarityFromPercent(percent: number | null): number | null {
  if (percent === null) return null;
  if (percent < 5) return 0;
  if (percent < 15) return 1;
  if (percent < 50) return 2;
  return 3;
}

type GameRow = { id: string; steamHasAchievements: boolean | null };

/**
 * Busca (o crea) la fila de `games` del appid. Un juego que está en PSN y en
 * Steam son dos filas distintas en v1: acá nunca se adopta una fila de PSN.
 */
async function resolveGameRow(
  supabase: SupabaseClient<Database>,
  userId: string,
  game: SteamOwnedGame,
): Promise<GameRow | null> {
  const { data: existing } = await supabase
    .from("games")
    .select("id, steam_has_achievements")
    .eq("steam_appid", game.appId)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, steamHasAchievements: existing.steam_has_achievements };
  }

  // La carátula "oficial" de un juego de Steam ya viene de Steam; RAWG es un
  // complemento para el resto de la ficha, nunca la fuente principal ni un
  // bloqueante del sync.
  const coverUrl = await findCoverUrl(game.name).catch(() => null);

  const { data: created } = await supabase
    .from("games")
    .insert({
      steam_appid: game.appId,
      name: game.name,
      platform: "Steam",
      icon_url: game.iconUrl,
      cover_url: coverUrl,
      created_by: userId,
      source: "steam",
    })
    .select("id, steam_has_achievements")
    .single();

  if (created) {
    return { id: created.id, steamHasAchievements: created.steam_has_achievements };
  }

  // Carrera con otro sync insertando el mismo appid: reintentar la lectura.
  const { data: retry } = await supabase
    .from("games")
    .select("id, steam_has_achievements")
    .eq("steam_appid", game.appId)
    .maybeSingle();
  return retry ? { id: retry.id, steamHasAchievements: retry.steam_has_achievements } : null;
}

async function syncTitle(
  supabase: SupabaseClient<Database>,
  userId: string,
  steamId64: string,
  game: SteamOwnedGame,
): Promise<{ titleSynced: boolean; achievements: number; withoutAchievements: boolean }> {
  const row = await resolveGameRow(supabase, userId, game);
  if (!row) return { titleSynced: false, achievements: 0, withoutAchievements: false };

  await supabase
    .from("user_games")
    .upsert(
      { user_id: userId, game_id: row.id, last_played_at: game.lastPlayedAt },
      { onConflict: "user_id,game_id" },
    );

  // Ya sabemos que este juego no tiene logros: no se le vuelve a pedir el
  // schema en cada sync (la cuota de la key es compartida por toda la app).
  if (row.steamHasAchievements === false) {
    return { titleSynced: true, achievements: 0, withoutAchievements: true };
  }

  const result = await fetchGameAchievements(steamId64, game.appId);

  if (result.status === "no_achievements") {
    await supabase
      .from("games")
      .update({ steam_has_achievements: false })
      .eq("id", row.id)
      .eq("created_by", userId);
    return { titleSynced: true, achievements: 0, withoutAchievements: true };
  }

  if (row.steamHasAchievements !== true) {
    await supabase
      .from("games")
      .update({ steam_has_achievements: true })
      .eq("id", row.id)
      .eq("created_by", userId);
  }

  // Upsert en bloque por título, nunca fila por fila: con bibliotecas de
  // cientos de juegos eso es lo que hace que el sync supere el timeout.
  const rows = result.achievements.map((achievement) => ({
    game_id: row.id,
    trophy_id: achievement.apiName,
    name: achievement.name,
    description: achievement.description,
    type: "achievement",
    icon_url: achievement.iconUrl,
    hidden: achievement.hidden,
    sort_order: achievement.sortOrder,
    rarity: rarityFromPercent(achievement.globalPercent),
    earned_rate: achievement.globalPercent,
    created_by: userId,
  }));

  await supabase.from("trophies").upsert(rows, { onConflict: "game_id,trophy_id" });

  const { data: stored } = await supabase
    .from("trophies")
    .select("id, trophy_id")
    .eq("game_id", row.id);
  const idByApiName = new Map((stored ?? []).map((t) => [t.trophy_id, t.id]));

  const earnedRows = result.achievements
    .filter((achievement) => achievement.earned)
    .map((achievement) => ({
      user_id: userId,
      trophy_id: idByApiName.get(achievement.apiName),
      unlocked_at: achievement.earnedAt,
    }))
    .filter((entry): entry is { user_id: string; trophy_id: string; unlocked_at: string | null } =>
      Boolean(entry.trophy_id),
    );

  if (earnedRows.length > 0) {
    await supabase.from("user_trophies").upsert(earnedRows, { onConflict: "user_id,trophy_id" });
  }

  return { titleSynced: true, achievements: result.achievements.length, withoutAchievements: false };
}

/**
 * Trae la biblioteca y los logros del usuario desde Steam y los persiste.
 *
 * Si el perfil está en privado, el sync no revienta con un error genérico:
 * marca profile_visibility = 'private' en la cuenta y propaga
 * SteamProfilePrivateError para que la UI pida cambiar la configuración de
 * privacidad, que es lo único que destraba el flujo.
 */
export async function syncSteamAchievementsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SteamSyncResult> {
  const { data: account } = await supabase
    .from("steam_accounts")
    .select("steam_id64")
    .eq("user_id", userId)
    .maybeSingle();

  if (!account) {
    throw new SteamApiError("No hay una cuenta de Steam conectada para este usuario.");
  }

  const callsBefore = getSteamCallCount();

  let owned: SteamOwnedGame[];
  try {
    owned = await getOwnedGames(account.steam_id64);
  } catch (cause) {
    if (cause instanceof SteamProfilePrivateError) {
      await supabase
        .from("steam_accounts")
        .update({ profile_visibility: "private" })
        .eq("user_id", userId);
    }
    throw cause;
  }

  const results = await mapWithConcurrency(owned, TITLE_CONCURRENCY, (game) =>
    syncTitle(supabase, userId, account.steam_id64, game),
  );

  // El nombre y el avatar pueden cambiar en Steam sin que el usuario reconecte.
  // Igual criterio que el avatar de PSN: si falla, no aborta el sync.
  const summary = await getPlayerSummary(account.steam_id64).catch(() => null);

  await supabase
    .from("steam_accounts")
    .update({
      profile_visibility: "public",
      last_synced_at: new Date().toISOString(),
      ...(summary ? { persona_name: summary.personaName, avatar_url: summary.avatarUrl } : {}),
    })
    .eq("user_id", userId);

  // La cuota son 100.000 llamadas/día para TODA la app: saber cuánto gasta un
  // sync es lo único que avisa a tiempo que el margen se está achicando.
  console.log(
    `[steam-sync] ${owned.length} juegos, ${getSteamCallCount() - callsBefore} llamadas a la Steam Web API.`,
  );

  return {
    titlesSynced: results.filter((r) => r.titleSynced).length,
    achievementsSynced: results.reduce((sum, r) => sum + r.achievements, 0),
    titlesWithoutAchievements: results.filter((r) => r.withoutAchievements).length,
  };
}
