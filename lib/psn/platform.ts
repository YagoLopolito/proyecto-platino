import "server-only";

/** Plataformas que la app distingue. */
export const PLATFORMS = ["PS3", "PS4", "PS5", "PS Vita"] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * PSN devuelve `trophyTitlePlatform` como un valor único o varios separados por
 * coma (ej. "PS4,PSVITA") cuando el trophy set es compartido entre plataformas.
 * Nos quedamos con la más "alta" disponible para mostrar una sola plataforma por juego.
 */
export function mapPsnPlatformToLocal(trophyTitlePlatform: string): Platform | null {
  const tokens = trophyTitlePlatform.split(",").map((t) => t.trim().toUpperCase());
  const priority: Platform[] = ["PS5", "PS4", "PS3", "PS Vita"];
  for (const platform of priority) {
    const normalized = platform.replace(" ", "");
    if (tokens.includes(normalized) || tokens.includes(platform)) {
      return platform;
    }
  }
  return null;
}
