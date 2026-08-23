import "server-only";
import { asRecord, readNumber, readResponse, readString, steamFetch } from "./client";
import { SteamProfilePrivateError } from "./errors";

export type SteamOwnedGame = {
  appId: number;
  name: string;
  iconUrl: string | null;
  playtimeMinutes: number;
  lastPlayedAt: string | null;
};

/** La CDN pública que sirve los íconos de `img_icon_url`. */
function buildIconUrl(appId: number, iconHash: string | null): string | null {
  if (!iconHash) return null;
  return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`;
}

/**
 * IPlayerService/GetOwnedGames.
 *
 * Con "Detalles del juego" en privado la API responde HTTP 200 con
 * `{ "response": {} }` -- sin la clave `games` y sin `game_count`. Eso NO es
 * "el usuario no tiene juegos": es el perfil en privado, y se distingue por la
 * ausencia de `game_count` (una biblioteca realmente vacía trae
 * `game_count: 0`).
 *
 * Los free-to-play que el usuario nunca abrió entran igual a la biblioteca
 * (`include_played_free_games=1`): filtrarlos, si hiciera falta, es una
 * decisión de presentación, como ya se hace con `source = 'catalog'`.
 */
export async function getOwnedGames(steamId64: string): Promise<SteamOwnedGame[]> {
  const payload = await steamFetch("/IPlayerService/GetOwnedGames/v1/", {
    steamid: steamId64,
    include_appinfo: "1",
    include_played_free_games: "1",
  });

  const response = readResponse(payload);
  if (!response || !("game_count" in response)) {
    throw new SteamProfilePrivateError();
  }

  const games = response.games;
  if (!Array.isArray(games)) return [];

  return games
    .map((raw): SteamOwnedGame | null => {
      const game = asRecord(raw);
      if (!game) return null;
      const appId = readNumber(game, "appid");
      if (appId === null) return null;

      const lastPlayed = readNumber(game, "rtime_last_played");
      return {
        appId,
        name: readString(game, "name") ?? `App ${appId}`,
        iconUrl: buildIconUrl(appId, readString(game, "img_icon_url")),
        playtimeMinutes: readNumber(game, "playtime_forever") ?? 0,
        lastPlayedAt: lastPlayed && lastPlayed > 0 ? new Date(lastPlayed * 1000).toISOString() : null,
      };
    })
    .filter((game): game is SteamOwnedGame => game !== null);
}
