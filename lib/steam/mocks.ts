import "server-only";

/**
 * Mocks deterministas de la Steam Web API para la suite E2E.
 *
 * El interruptor `E2E_MOCKS` se lee **solo acá adentro de `lib/`** (regla de
 * CLAUDE.md): ninguna página, componente ni Server Action sabe que existe. En
 * Vercel la variable nunca está definida, así que el camino real es el único
 * que corre en producción.
 *
 * Todo lo que devuelven estos mocks es identificable y borrable por el
 * teardown: los appids viven arriba de `E2E_MOCK_APPID_MIN` y los nombres
 * llevan el prefijo `[E2E]`.
 */

export const STEAM_MOCKS_ENABLED = process.env.E2E_MOCKS === "1";

/** Los appids de test arrancan acá; el teardown borra `games` desde este número. */
export const E2E_MOCK_APPID_MIN = 999_000_000;

const APPID_WITH_ACHIEVEMENTS = 999_000_001;
const APPID_WITHOUT_ACHIEVEMENTS = 999_000_002;

/** Perfil público de test. */
const PUBLIC_STEAM_ID = "76561199000000001";
/** Perfil con "Detalles del juego" en privado. */
const PRIVATE_STEAM_ID = "76561199000000002";

export const MOCK_VANITY_PUBLIC = "e2e-steam-user";
export const MOCK_VANITY_PRIVATE = "e2e-steam-private";

function playerSummary(steamId: string) {
  const isPrivate = steamId === PRIVATE_STEAM_ID;
  return {
    steamid: steamId,
    personaname: isPrivate ? "[E2E] Steam Privado" : "[E2E] Steam User",
    avatarfull: null,
    // El perfil privado se detecta ya en el summary; el público puede igual
    // tener "Detalles del juego" en privado, y eso recién se ve al pedir la
    // biblioteca (por eso el mock de GetOwnedGames también lo contempla).
    communityvisibilitystate: isPrivate ? 1 : 3,
  };
}

/**
 * Devuelve la respuesta simulada de un endpoint, o `undefined` si el path no
 * está mockeado (en ese caso el llamador sigue con la llamada real).
 */
export function getSteamMockResponse(
  path: string,
  params: Record<string, string>,
): unknown | undefined {
  if (path.includes("ResolveVanityURL")) {
    const vanity = params.vanityurl;
    if (vanity === MOCK_VANITY_PUBLIC) {
      return { response: { success: 1, steamid: PUBLIC_STEAM_ID } };
    }
    if (vanity === MOCK_VANITY_PRIVATE) {
      return { response: { success: 1, steamid: PRIVATE_STEAM_ID } };
    }
    return { response: { success: 42, message: "No match" } };
  }

  if (path.includes("GetPlayerSummaries")) {
    const steamId = params.steamids ?? "";
    if (steamId !== PUBLIC_STEAM_ID && steamId !== PRIVATE_STEAM_ID) {
      return { response: { players: [] } };
    }
    return { response: { players: [playerSummary(steamId)] } };
  }

  if (path.includes("GetOwnedGames")) {
    // Perfil con los detalles del juego en privado: HTTP 200 y `response`
    // vacío, sin `game_count`. Es el caso que la app tiene que distinguir de
    // "no tiene juegos".
    if (params.steamid === PRIVATE_STEAM_ID) return { response: {} };
    return {
      response: {
        game_count: 2,
        games: [
          {
            appid: APPID_WITH_ACHIEVEMENTS,
            name: "[E2E] Steam Game Con Logros",
            img_icon_url: null,
            playtime_forever: 120,
            rtime_last_played: 1_700_000_000,
          },
          {
            appid: APPID_WITHOUT_ACHIEVEMENTS,
            name: "[E2E] Steam Game Sin Logros",
            img_icon_url: null,
            playtime_forever: 0,
            rtime_last_played: 0,
          },
        ],
      },
    };
  }

  if (path.includes("GetRecentlyPlayedGames")) {
    if (params.steamid === PRIVATE_STEAM_ID) return { response: {} };
    return { response: { total_count: 0, games: [] } };
  }

  if (path.includes("GetSchemaForGame")) {
    if (Number(params.appid) !== APPID_WITH_ACHIEVEMENTS) return { game: {} };
    return {
      game: {
        gameName: "[E2E] Steam Game Con Logros",
        availableGameStats: {
          achievements: [
            {
              name: "E2E_ACH_1",
              displayName: "[E2E] Primer logro",
              description: "Logro de prueba ya desbloqueado.",
              // Con el host viejo a propósito: es el que devuelve Steam de
              // verdad, y el sync tiene que normalizarlo.
              icon: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${APPID_WITH_ACHIEVEMENTS}/e2e1.jpg`,
              hidden: 0,
            },
            {
              name: "E2E_ACH_2",
              displayName: "[E2E] Segundo logro",
              description: "Logro de prueba pendiente.",
              icon: null,
              hidden: 1,
            },
          ],
        },
      },
    };
  }

  if (path.includes("GetPlayerAchievements")) {
    if (Number(params.appid) !== APPID_WITH_ACHIEVEMENTS) {
      return { playerstats: { success: false, error: "Requested app has no stats" } };
    }
    return {
      playerstats: {
        success: true,
        achievements: [
          { apiname: "E2E_ACH_1", achieved: 1, unlocktime: 1_700_000_000 },
          { apiname: "E2E_ACH_2", achieved: 0, unlocktime: 0 },
        ],
      },
    };
  }

  if (path.includes("GetGlobalAchievementPercentagesForApp")) {
    return {
      achievementpercentages: {
        achievements: [
          { name: "E2E_ACH_1", percent: 62.5 },
          { name: "E2E_ACH_2", percent: 3.1 },
        ],
      },
    };
  }

  return undefined;
}
