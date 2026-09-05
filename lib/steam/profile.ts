import "server-only";
import { asRecord, readResponse, readString, steamFetch } from "./client";
import { SteamProfileNotFoundError } from "./errors";

export type SteamProfile = {
  steamId64: string;
  personaName: string;
  avatarUrl: string | null;
  /**
   * `communityvisibilitystate` 3 = público. Cualquier otro valor significa que
   * ni siquiera el perfil básico es visible, así que los juegos tampoco.
   * OJO: un perfil público puede tener igual "Detalles del juego" en privado;
   * eso solo se detecta al pedir la biblioteca (ver lib/steam/library.ts).
   */
  isProfilePublic: boolean;
};

/** Un SteamID64 es un entero de 17 dígitos que arranca en 7656119. */
const STEAM_ID64_RE = /^7656119\d{10}$/;

/**
 * Acepta lo que el usuario pegue: el SteamID64 pelado, una URL de perfil
 * (`/profiles/765...`) o una URL personalizada (`/id/loquesea`, o directamente
 * el vanity name suelto).
 */
export function parseSteamInput(raw: string): { kind: "id64" | "vanity"; value: string } | null {
  const input = raw.trim();
  if (!input) return null;

  if (STEAM_ID64_RE.test(input)) return { kind: "id64", value: input };

  const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch) return { kind: "id64", value: profileMatch[1] };

  const vanityMatch = input.match(/steamcommunity\.com\/id\/([^/?#\s]+)/i);
  if (vanityMatch) return { kind: "vanity", value: decodeURIComponent(vanityMatch[1]) };

  // Cualquier otra URL no es de Steam: no la tratamos como vanity name.
  if (/[/\s]/.test(input) || input.includes(".")) return null;

  return { kind: "vanity", value: input };
}

/** ISteamUser/ResolveVanityURL: URL personalizada -> SteamID64. */
export async function resolveVanityUrl(vanity: string): Promise<string> {
  const payload = await steamFetch("/ISteamUser/ResolveVanityURL/v1/", { vanityurl: vanity });
  const response = readResponse(payload);
  // success = 1 (encontrado) | 42 (no match). Cualquier otra cosa: no existe.
  if (!response || response.success !== 1) throw new SteamProfileNotFoundError();
  const steamId = readString(response, "steamid");
  if (!steamId) throw new SteamProfileNotFoundError();
  return steamId;
}

/** ISteamUser/GetPlayerSummaries: nombre y avatar de la cuenta. */
export async function getPlayerSummary(steamId64: string): Promise<SteamProfile> {
  const payload = await steamFetch("/ISteamUser/GetPlayerSummaries/v2/", {
    steamids: steamId64,
  });
  const response = readResponse(payload);
  const players = response?.players;
  if (!Array.isArray(players) || players.length === 0) throw new SteamProfileNotFoundError();

  const player = asRecord(players[0]);
  if (!player) throw new SteamProfileNotFoundError();

  return {
    steamId64: readString(player, "steamid") ?? steamId64,
    personaName: readString(player, "personaname") ?? steamId64,
    avatarUrl:
      readString(player, "avatarfull") ??
      readString(player, "avatarmedium") ??
      readString(player, "avatar"),
    isProfilePublic: player.communityvisibilitystate === 3,
  };
}

/** Resuelve lo que el usuario tipeó a un perfil concreto de Steam. */
export async function resolveSteamProfile(rawInput: string): Promise<SteamProfile> {
  const parsed = parseSteamInput(rawInput);
  if (!parsed) throw new SteamProfileNotFoundError();

  const steamId64 = parsed.kind === "id64" ? parsed.value : await resolveVanityUrl(parsed.value);

  return getPlayerSummary(steamId64);
}
