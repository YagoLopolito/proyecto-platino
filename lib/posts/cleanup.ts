import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { ABANDONED_UPLOAD_HOURS, POST_MEDIA_BUCKET } from "./constants";

type ServiceClient = ReturnType<typeof createServiceClient>;

/** Un objeto huérfano se deja en paz durante esta ventana (por si su post se está creando). */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;
/** Tope por corrida: el cron es diario y comparte su límite de tiempo con el sync. */
const ORPHANS_PER_RUN = 500;
/** `storage.remove` acepta lotes; 100 por llamada. */
const REMOVE_BATCH = 100;

export interface PostsCleanupResult {
  abandonedPosts: number;
  orphanObjects: number;
}

/**
 * Paso de limpieza de la Galería online, corrido por `/api/cron/sync`
 * (`?paso=publicaciones`, y al final de la corrida diaria). Dos cosas:
 *
 * 1. Borra los posts que siguen en `uploading` después de
 *    `ABANDONED_UPLOAD_HOURS`: alguien cerró la pestaña a mitad de una subida.
 * 2. Borra de Storage los objetos cuyo post ya no existe: los de (1) y los que
 *    un `deletePost` no llegó a borrar.
 *
 * Usa service role (no hay sesión en un cron). Los objetos se borran por la
 * API de Storage, nunca con SQL sobre `storage.objects`.
 */
export async function cleanupPosts(
  supabase: ServiceClient,
  now: Date = new Date(),
): Promise<PostsCleanupResult> {
  const abandonedBefore = new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000);
  const { data: abandoned, error: abandonedError } = await supabase
    .from("posts")
    .delete()
    .eq("status", "uploading")
    .lt("created_at", abandonedBefore.toISOString())
    .select("id");
  if (abandonedError) throw new Error(abandonedError.message);

  const { data: orphans, error: orphansError } = await supabase.rpc("post_media_orphans", {
    older_than: new Date(now.getTime() - ORPHAN_GRACE_MS).toISOString(),
    max_rows: ORPHANS_PER_RUN,
  });
  if (orphansError) throw new Error(orphansError.message);

  const names = (orphans ?? []).map((row) => row.name);
  let removed = 0;
  for (let i = 0; i < names.length; i += REMOVE_BATCH) {
    const batch = names.slice(i, i + REMOVE_BATCH);
    const { data, error } = await supabase.storage.from(POST_MEDIA_BUCKET).remove(batch);
    if (error) throw new Error(error.message);
    removed += data?.length ?? 0;
  }

  return { abandonedPosts: abandoned?.length ?? 0, orphanObjects: removed };
}
