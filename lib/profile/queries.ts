import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface PublicProfile {
  id: string;
  displayName: string | null;
  profileName: string | null;
  /** Plataforma con la que se muestra (nombre y foto); null sin cuentas. */
  profilePlatform: "psn" | "steam" | null;
  avatarUrl: string | null;
  trophyLevel: number | null;
  trophyProgress: number | null;
  earned: { platinum: number; gold: number; silver: number; bronze: number } | null;
}

export interface FavoriteGame {
  id: string;
  name: string;
  imageUrl: string | null;
  isSteam: boolean;
}

/**
 * Datos públicos de un usuario, desde la vista `public_profiles` (nombre,
 * avatar y nivel/totales de trofeos que informa PSN). Es la única fuente
 * posible para el perfil de otro usuario: `psn_accounts` tiene RLS de "solo el
 * dueño" y `user_trophies` es privado.
 */
export async function getPublicProfile(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<PublicProfile | null> {
  const { data } = await supabase
    .from("public_profiles")
    .select(
      "id, display_name, profile_name, profile_avatar_url, profile_platform, trophy_level, trophy_progress, earned_platinum, earned_gold, earned_silver, earned_bronze",
    )
    .eq("id", userId)
    .maybeSingle();

  if (!data?.id) return null;

  // Un usuario sin cuenta PSN conectada viene con todo el lado derecho del
  // left join en NULL: ahí `earned` es null (no cuatro ceros, que se leerían
  // como "no tiene ningún trofeo").
  const hasTrophyCounts = data.earned_bronze !== null && data.earned_bronze !== undefined;

  return {
    id: data.id,
    displayName: data.display_name,
    profileName: data.profile_name,
    profilePlatform:
      data.profile_platform === "psn" || data.profile_platform === "steam"
        ? data.profile_platform
        : null,
    avatarUrl: data.profile_avatar_url,
    trophyLevel: data.trophy_level,
    trophyProgress: data.trophy_progress,
    earned: hasTrophyCounts
      ? {
          platinum: data.earned_platinum ?? 0,
          gold: data.earned_gold ?? 0,
          silver: data.earned_silver ?? 0,
          bronze: data.earned_bronze ?? 0,
        }
      : null,
  };
}

/**
 * El Top 5 elegido por el usuario, en el orden de sus casilleros.
 *
 * No trae progreso de trofeos a propósito: para el perfil de otro usuario no se
 * puede (es `user_trophies`, privado), y mostrar la barra solo en el perfil
 * propio haría que la misma sección se vea distinta según quién la mire. El
 * Top 5 es una vitrina, el progreso está en la biblioteca.
 */
export async function getFavoriteGames(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<FavoriteGame[]> {
  const { data } = await supabase
    .from("user_favorite_games")
    .select("slot, games!inner (id, name, cover_url, icon_url, source)")
    .eq("user_id", userId)
    .order("slot", { ascending: true });

  return (data ?? []).flatMap((row) => {
    const game = row.games;
    if (!game) return [];
    return {
      id: game.id,
      name: game.name,
      imageUrl: game.cover_url ?? game.icon_url,
      isSteam: game.source === "steam",
    };
  });
}
