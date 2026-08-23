import "server-only";
import { asRecord, readNumber, readString, steamFetch } from "./client";
import { SteamProfilePrivateError } from "./errors";

/** Un logro de Steam es plano: no hay bronce/plata/oro ni platino. */
export type SteamAchievement = {
  apiName: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  hidden: boolean;
  sortOrder: number;
  /** % global de jugadores que lo desbloqueó, si Steam lo publica para ese juego. */
  globalPercent: number | null;
  earned: boolean;
  earnedAt: string | null;
};

/**
 * Resultado de pedir los logros de un juego. `no_achievements` es un estado
 * propio y no un error: muchísimos títulos simplemente no tienen logros, y
 * confundirlo con una falla de la API haría que el sync los reintente para
 * siempre.
 */
export type SteamAchievementsResult =
  | { status: "ok"; achievements: SteamAchievement[] }
  | { status: "no_achievements" };

/**
 * GetSchemaForGame devuelve los íconos con el host viejo de Akamai
 * (`steamcdn-a.akamaihd.net`). Es el mismo archivo que sirve
 * `cdn.cloudflare.steamstatic.com` --byte a byte-- así que se normaliza al host
 * moderno, que es el que ya usa el resto de la app y el único que hace falta
 * whitelistear en `next.config.ts` para que `next/image` no rechace la URL.
 */
const LEGACY_CDN_HOSTS = ["steamcdn-a.akamaihd.net", "media.steampowered.com"];
const STEAM_CDN_HOST = "cdn.cloudflare.steamstatic.com";

function normalizeIconUrl(url: string | null): string | null {
  if (!url) return null;
  for (const host of LEGACY_CDN_HOSTS) {
    if (url.includes(`://${host}/`)) {
      return url.replace(`://${host}/`, `://${STEAM_CDN_HOST}/`);
    }
  }
  return url;
}

type SchemaEntry = {
  name: string;
  displayName: string;
  description: string | null;
  icon: string | null;
  hidden: boolean;
};

/** ISteamUserStats/GetSchemaForGame: el catálogo de logros del juego. */
async function getSchema(appId: number): Promise<SchemaEntry[]> {
  const payload = await steamFetch(
    "/ISteamUserStats/GetSchemaForGame/v2/",
    { appid: String(appId) },
    { notFoundAsNull: true },
  );
  if (payload === null) return [];

  const root = asRecord(payload);
  const game = asRecord(root?.game);
  const stats = asRecord(game?.availableGameStats);
  const achievements = stats?.achievements;
  if (!Array.isArray(achievements)) return [];

  return achievements
    .map((raw): SchemaEntry | null => {
      const entry = asRecord(raw);
      if (!entry) return null;
      const name = readString(entry, "name");
      if (!name) return null;
      return {
        name,
        displayName: readString(entry, "displayName") ?? name,
        description: readString(entry, "description"),
        icon: normalizeIconUrl(readString(entry, "icon")),
        hidden: readNumber(entry, "hidden") === 1,
      };
    })
    .filter((entry): entry is SchemaEntry => entry !== null);
}

/** ISteamUserStats/GetPlayerAchievements: los desbloqueados y cuándo. */
async function getPlayerAchievements(
  steamId64: string,
  appId: number,
): Promise<Map<string, { earned: boolean; earnedAt: string | null }>> {
  const payload = await steamFetch(
    "/ISteamUserStats/GetPlayerAchievements/v1/",
    { steamid: steamId64, appid: String(appId), l: "spanish" },
    { notFoundAsNull: true },
  );
  const result = new Map<string, { earned: boolean; earnedAt: string | null }>();
  if (payload === null) return result;

  const stats = asRecord(asRecord(payload)?.playerstats);
  if (!stats) return result;

  // success:false + "Profile is not public" -> es el perfil, no el juego.
  if (stats.success === false) {
    const message = readString(stats, "error") ?? "";
    if (/private|not public/i.test(message)) throw new SteamProfilePrivateError();
    return result;
  }

  const achievements = stats.achievements;
  if (!Array.isArray(achievements)) return result;

  for (const raw of achievements) {
    const entry = asRecord(raw);
    if (!entry) continue;
    const apiName = readString(entry, "apiname");
    if (!apiName) continue;
    const unlockTime = readNumber(entry, "unlocktime") ?? 0;
    result.set(apiName, {
      earned: readNumber(entry, "achieved") === 1,
      earnedAt: unlockTime > 0 ? new Date(unlockTime * 1000).toISOString() : null,
    });
  }
  return result;
}

/** ISteamUserStats/GetGlobalAchievementPercentagesForApp: la rareza. */
async function getGlobalPercentages(appId: number): Promise<Map<string, number>> {
  const percentages = new Map<string, number>();
  let payload: unknown;
  try {
    payload = await steamFetch(
      "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/",
      { gameid: String(appId) },
      { notFoundAsNull: true },
    );
  } catch {
    // La rareza es un extra: si falla, los logros se guardan igual.
    return percentages;
  }
  if (payload === null) return percentages;

  const root = asRecord(payload);
  const achievementPercentages = asRecord(root?.achievementpercentages);
  const list = achievementPercentages?.achievements;
  if (!Array.isArray(list)) return percentages;

  for (const raw of list) {
    const entry = asRecord(raw);
    if (!entry) continue;
    const name = readString(entry, "name");
    const percent = readNumber(entry, "percent");
    if (name && percent !== null) percentages.set(name, percent);
  }
  return percentages;
}

/**
 * Junta schema + desbloqueados + rareza de un juego. Tres llamadas por título:
 * es exactamente por esto que el sync va con concurrencia limitada y saltea los
 * juegos que ya sabemos que no tienen logros.
 */
export async function fetchGameAchievements(
  steamId64: string,
  appId: number,
): Promise<SteamAchievementsResult> {
  const schema = await getSchema(appId);
  if (schema.length === 0) return { status: "no_achievements" };

  const [unlocked, percentages] = await Promise.all([
    getPlayerAchievements(steamId64, appId),
    getGlobalPercentages(appId),
  ]);

  const achievements = schema.map((entry, index): SteamAchievement => {
    const progress = unlocked.get(entry.name);
    return {
      apiName: entry.name,
      name: entry.displayName,
      description: entry.description,
      iconUrl: entry.icon,
      hidden: entry.hidden,
      sortOrder: index,
      globalPercent: percentages.get(entry.name) ?? null,
      earned: progress?.earned ?? false,
      earnedAt: progress?.earned ? progress.earnedAt : null,
    };
  });

  return { status: "ok", achievements };
}
