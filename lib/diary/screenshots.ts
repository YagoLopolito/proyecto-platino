import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { SCREENSHOTS_BUCKET } from "@/lib/diary/screenshot-constants";
import { profileLabel } from "@/lib/friends/constants";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface GameScreenshot {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string;
  authorId: string;
  authorLabel: string;
  authorAvatarUrl: string | null;
  isOwn: boolean;
}

export type GameScreenshotsOutcome =
  | { status: "ok"; screenshots: GameScreenshot[] }
  | { status: "error"; message: string };

/**
 * Capturas de un juego, más nuevas primero. La galería es pública igual que el
 * diario (`game_diary_entries`), así que se ven las de todos los usuarios; el
 * flag `isOwn` es lo único que decide quién puede borrar en la UI (el borrado
 * real lo cortan la RLS de la tabla y la policy del bucket).
 *
 * El bucket es público, así que la URL sale de `getPublicUrl` (no hay signed
 * URLs que expiren) y la puede optimizar `next/image`.
 */
export async function getGameScreenshots(
  supabase: SupabaseServerClient,
  gameId: string,
  viewerId: string,
): Promise<GameScreenshotsOutcome> {
  const { data, error } = await supabase
    .from("game_screenshots")
    .select("id, user_id, storage_path, caption, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });

  if (error) {
    return { status: "error", message: error.message };
  }

  const rows = data ?? [];
  const authorIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const profiles = await getAuthorProfiles(supabase, authorIds);

  return {
    status: "ok",
    screenshots: rows.map((row) => {
      const profile = profiles.get(row.user_id);
      return {
        id: row.id,
        url: supabase.storage.from(SCREENSHOTS_BUCKET).getPublicUrl(row.storage_path).data
          .publicUrl,
        caption: row.caption,
        createdAt: row.created_at,
        authorId: row.user_id,
        authorLabel: profile?.label ?? "Usuario sin nombre",
        authorAvatarUrl: profile?.avatarUrl ?? null,
        isOwn: row.user_id === viewerId,
      };
    }),
  };
}

async function getAuthorProfiles(
  supabase: SupabaseServerClient,
  authorIds: string[],
): Promise<Map<string, { label: string; avatarUrl: string | null }>> {
  const out = new Map<string, { label: string; avatarUrl: string | null }>();
  if (authorIds.length === 0) return out;

  const { data } = await supabase
    .from("public_profiles")
    .select("id, display_name, psn_online_id, avatar_url")
    .in("id", authorIds);

  for (const profile of data ?? []) {
    if (!profile.id) continue;
    out.set(profile.id, {
      label: profileLabel({
        displayName: profile.display_name,
        psnOnlineId: profile.psn_online_id,
      }),
      avatarUrl: profile.avatar_url,
    });
  }
  return out;
}
