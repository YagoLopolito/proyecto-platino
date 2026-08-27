import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { findCoverUrl, findSteamCoverUrlByAppId } from "@/lib/covers";
import { mapWithConcurrency } from "@/lib/psn/concurrency";
import { reconcileCompletedDiaryEntry } from "@/lib/diary/platinum";
import { fetchGameAchievements } from "./achievements";
import { getSteamCallCount } from "./client";
import { SteamApiError, SteamProfilePrivateError } from "./errors";
import { getOwnedGames, getRecentlyPlayedAppIds, type SteamOwnedGame } from "./library";
import { getPlayerSummary } from "./profile";

export type SteamSyncResult = {
  titlesSynced: number;
  achievementsSynced: number;
  /** Juegos que se registraron en la biblioteca pero no tienen logros. */
  titlesWithoutAchievements: number;
  /**
   * Steam devolvió `playtime_forever = 0` para TODOS los juegos de una
   * biblioteca que no está vacía. No es un caso raro ni un bug del sync: es la
   * opción "Mantener en privado el tiempo total de juego" de la privacidad de
   * Steam, que se puede tener activada con el resto del perfil público (los
   * logros siguen sincronizando). La UI lo explica en vez de mostrar una
   * biblioteca entera sin horas y sin motivo.
   */
  playtimeHidden: boolean;
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

const GAME_SELECT = "id, cover_url, steam_has_achievements";

/**
 * La portada sale de la CDN de Steam (`library_600x900`), no del
 * `img_icon_url` que trae GetOwnedGames: ese es un ícono de 32x32 y se ve
 * pixelado en cualquier tarjeta. RAWG queda como último recurso.
 */
async function resolveCoverUrl(appId: number, name: string): Promise<string | null> {
  const steamCover = await findSteamCoverUrlByAppId(appId).catch(() => null);
  if (steamCover) return steamCover;
  return findCoverUrl(name).catch(() => null);
}

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
    .select(GAME_SELECT)
    .eq("steam_appid", game.appId)
    .maybeSingle();

  if (existing) {
    // Backfill de las filas que se sincronizaron antes de que la portada
    // saliera de la CDN de Steam: se quedaron sin cover_url y la UI caía al
    // ícono de 32x32.
    if (!existing.cover_url) {
      const coverUrl = await resolveCoverUrl(game.appId, game.name);
      if (coverUrl) {
        await supabase
          .from("games")
          .update({ cover_url: coverUrl })
          .eq("id", existing.id)
          .eq("created_by", userId);
      }
    }
    return { id: existing.id, steamHasAchievements: existing.steam_has_achievements };
  }

  const coverUrl = await resolveCoverUrl(game.appId, game.name);

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
    .select(GAME_SELECT)
    .single();

  if (created) {
    return { id: created.id, steamHasAchievements: created.steam_has_achievements };
  }

  // Carrera con otro sync insertando el mismo appid: reintentar la lectura.
  const { data: retry } = await supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("steam_appid", game.appId)
    .maybeSingle();
  return retry ? { id: retry.id, steamHasAchievements: retry.steam_has_achievements } : null;
}

async function syncTitle(
  supabase: SupabaseClient<Database>,
  userId: string,
  steamId64: string,
  game: SteamOwnedGame,
  recentlyPlayedAppIds: Set<number>,
  syncStartedAt: string,
): Promise<{ titleSynced: boolean; achievements: number; withoutAchievements: boolean }> {
  const row = await resolveGameRow(supabase, userId, game);
  if (!row) return { titleSynced: false, achievements: 0, withoutAchievements: false };

  // `rtime_last_played` de GetOwnedGames viene en null para estas cuentas: si
  // GetRecentlyPlayedGames dice que se jugó en las últimas dos semanas, se usa
  // el momento del sync como aproximación -- no es la fecha exacta, pero
  // alcanza para que suba arriba de la biblioteca en vez de quedar hundido.
  const lastPlayedAt =
    game.lastPlayedAt ?? (recentlyPlayedAppIds.has(game.appId) ? syncStartedAt : null);

  await supabase
    .from("user_games")
    .upsert(
      {
        user_id: userId,
        game_id: row.id,
        last_played_at: lastPlayedAt,
        playtime_minutes: game.playtimeMinutes,
      },
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

  // Equivalente al platino para Steam: el juego al 100%. Va en try/catch igual
  // que el hook de platino -- es un extra sobre el sync, si falla no puede
  // tirar abajo la sincronización de logros del título.
  const earned = result.achievements.filter((achievement) => achievement.earned);
  if (earned.length === result.achievements.length && earned.length > 0) {
    // La fecha es la del ÚLTIMO logro, no la del sync: si no, una biblioteca
    // vieja quedaría toda fechada el día que la sincronizaste por primera vez.
    const completedAt = earned
      .map((achievement) => achievement.earnedAt)
      .filter((date): date is string => date !== null)
      .sort()
      .at(-1);
    if (completedAt) {
      try {
        await reconcileCompletedDiaryEntry(supabase, userId, row.id, completedAt);
      } catch (cause) {
        console.error(`[steam-sync] no se pudo actualizar el diario al 100% (${game.name}):`, cause);
      }
    }
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

  const recentlyPlayedAppIds = await getRecentlyPlayedAppIds(account.steam_id64).catch(() => new Set<number>());
  const syncStartedAt = new Date().toISOString();

  const results = await mapWithConcurrency(owned, TITLE_CONCURRENCY, (game) =>
    syncTitle(supabase, userId, account.steam_id64, game, recentlyPlayedAppIds, syncStartedAt),
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
    `[steam-sync] ${owned.length} juegos (${owned.filter((game) => game.playtimeMinutes > 0).length} con horas), ` +
      `${results.filter((r) => r.titleSynced).length} guardados, ` +
      `${getSteamCallCount() - callsBefore} llamadas a la Steam Web API.`,
  );

  return {
    titlesSynced: results.filter((r) => r.titleSynced).length,
    achievementsSynced: results.reduce((sum, r) => sum + r.achievements, 0),
    titlesWithoutAchievements: results.filter((r) => r.withoutAchievements).length,
    playtimeHidden: owned.length > 0 && owned.every((game) => game.playtimeMinutes === 0),
  };
}
