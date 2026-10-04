"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  POST_MEDIA_BUCKET,
  displayPathFor,
  formatMegabytes,
  isAcceptedMediaType,
  maxBytesFor,
  mediaKindOf,
  parseMediaPath,
  posterPathFor,
} from "./constants";
import { captionSchema, confirmPostSchema, type ConfirmedMedia } from "./validation";
import { SNIFF_BYTES, sniffMatchesDeclared } from "./sniff";

/**
 * Server Actions de la Galería online. Doble capa como todo el contenido de
 * usuario de la app: cada action valida dueño y forma, y la RLS de `posts` /
 * `post_media` / `storage.objects` lo vuelve a cortar del lado de la base.
 */

const uuidSchema = z.string().uuid();

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateGallery(gameId: string) {
  revalidatePath("/actividad/galeria");
  revalidatePath(`/juegos/${gameId}/capturas`);
  revalidatePath("/perfil", "layout");
}

// Crear --------------------------------------------------------------------

export type CreateDraftResult =
  { status: "ok"; postId: string; userId: string } | { status: "error"; message: string };

/**
 * Paso 1 de publicar: el post nace en `uploading` (invisible para los demás)
 * para que la policy de Storage deje subir archivos a su carpeta. Si el
 * usuario abandona, lo limpia el cron (`lib/posts/cleanup.ts`).
 */
export async function createDraftPost(input: {
  gameId: string;
  caption: string;
  isSpoiler: boolean;
}): Promise<CreateDraftResult> {
  const gameId = uuidSchema.safeParse(input.gameId);
  if (!gameId.success) return { status: "error", message: "Elegí el juego de la publicación." };
  const caption = captionSchema.safeParse(input.caption ?? "");
  if (!caption.success) {
    return {
      status: "error",
      message: caption.error.issues[0]?.message ?? "Descripción inválida.",
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { status: "error", message: "Tenés que iniciar sesión." };

  const { data: game } = await supabase
    .from("games")
    .select("id")
    .eq("id", gameId.data)
    .maybeSingle();
  if (!game) return { status: "error", message: "Ese juego no existe." };

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      game_id: gameId.data,
      caption: caption.data,
      is_spoiler: Boolean(input.isSpoiler),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { status: "error", message: `No se pudo crear la publicación: ${error?.message ?? ""}` };
  }
  return { status: "ok", postId: data.id, userId: user.id };
}

export type ConfirmPostResult =
  { status: "ok"; postId: string } | { status: "error"; message: string };

/** Primeros bytes de un objeto ya subido, por una URL firmada con Range. */
async function readHead(supabase: Supabase, path: string): Promise<Uint8Array | null> {
  const { data } = await supabase.storage.from(POST_MEDIA_BUCKET).createSignedUrl(path, 60);
  if (!data?.signedUrl) return null;
  try {
    const response = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer()).subarray(0, SNIFF_BYTES);
  } catch {
    return null;
  }
}

/**
 * Paso 3 de publicar: los archivos ya están en Storage. Antes de pasar el post
 * a `published` se revalida TODO del lado del servidor, sin creerle al
 * cliente: que cada path sea de este usuario y este post, que exista, el
 * tamaño real (de la metadata de Storage, no el que dice el cliente), el MIME
 * declarado y el tipo real por magic bytes.
 */
export async function confirmPost(input: {
  postId: string;
  media: ConfirmedMedia[];
}): Promise<ConfirmPostResult> {
  const parsed = confirmPostSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { postId, media } = parsed.data;

  const { supabase, user } = await requireUser();
  if (!user) return { status: "error", message: "Tenés que iniciar sesión." };

  const { data: post } = await supabase
    .from("posts")
    .select("id, user_id, game_id, status")
    .eq("id", postId)
    .maybeSingle();
  if (!post || post.user_id !== user.id) {
    return { status: "error", message: "No encontramos la publicación." };
  }
  if (post.status !== "uploading") return { status: "ok", postId };

  // Lo que efectivamente quedó en la carpeta del post.
  const { data: objects, error: listError } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .list(`${user.id}/${postId}`, { limit: 100 });
  if (listError)
    return { status: "error", message: `No se pudieron leer los archivos: ${listError.message}` };
  const stored = new Map(
    (objects ?? []).map((object) => [
      `${user.id}/${postId}/${object.name}`,
      {
        size: Number((object.metadata as { size?: number } | null)?.size ?? 0),
        mimetype: String((object.metadata as { mimetype?: string } | null)?.mimetype ?? ""),
      },
    ]),
  );

  const rows = [];
  for (const item of media) {
    const owner = parseMediaPath(item.storagePath);
    if (!owner || owner.userId !== user.id || owner.postId !== postId) {
      return { status: "error", message: "Un archivo no pertenece a esta publicación." };
    }
    if (!isAcceptedMediaType(item.mimeType)) {
      return { status: "error", message: "Un archivo tiene un formato no admitido." };
    }
    const kind = mediaKindOf(item.mimeType);
    if (item.displayPath !== null && item.displayPath !== displayPathFor(item.storagePath)) {
      return { status: "error", message: "La miniatura de un archivo no coincide." };
    }
    if (item.posterPath !== null && item.posterPath !== posterPathFor(item.storagePath)) {
      return { status: "error", message: "El poster de un video no coincide." };
    }
    if (kind === "video" && item.posterPath === null) {
      return { status: "error", message: "Falta el poster de un video." };
    }

    const original = stored.get(item.storagePath);
    if (!original) return { status: "error", message: "Falta subir un archivo. Reintentá." };
    for (const derived of [item.displayPath, item.posterPath]) {
      if (derived && !stored.has(derived)) {
        return { status: "error", message: "Falta subir una miniatura. Reintentá." };
      }
    }
    if (original.size <= 0 || original.size > maxBytesFor(kind)) {
      return {
        status: "error",
        message: `Un archivo pesa más de ${formatMegabytes(maxBytesFor(kind))}.`,
      };
    }
    if (original.mimetype && original.mimetype !== item.mimeType) {
      return { status: "error", message: "El tipo de un archivo no coincide con lo subido." };
    }

    const head = await readHead(supabase, item.storagePath);
    if (!head || !sniffMatchesDeclared(item.mimeType, head)) {
      return {
        status: "error",
        message: "Un archivo no es la imagen o el video que dice ser.",
      };
    }

    rows.push({
      post_id: postId,
      position: item.position,
      storage_path: item.storagePath,
      display_path: item.displayPath,
      poster_path: item.posterPath,
      media_type: kind,
      mime_type: item.mimeType,
      width: item.width,
      height: item.height,
      duration_seconds: kind === "video" ? item.durationSeconds : null,
      size_bytes: original.size,
    });
  }

  // Un reintento de confirmación no puede chocar con el unique de position.
  await supabase.from("post_media").delete().eq("post_id", postId);
  const { error: insertError } = await supabase.from("post_media").insert(rows);
  if (insertError) {
    return {
      status: "error",
      message: `No se pudieron guardar los archivos: ${insertError.message}`,
    };
  }

  const { error: publishError } = await supabase
    .from("posts")
    .update({ status: "published" })
    .eq("id", postId);
  if (publishError) {
    return { status: "error", message: `No se pudo publicar: ${publishError.message}` };
  }

  revalidateGallery(post.game_id);
  return { status: "ok", postId };
}

/** "Cancelar" a mitad de una subida: borra el borrador y lo que ya subió. */
export async function abandonDraft(postId: string): Promise<{ error: string | null }> {
  const parsed = uuidSchema.safeParse(postId);
  if (!parsed.success) return { error: null };
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const folder = `${user.id}/${parsed.data}`;
  const { data: objects } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .list(folder, { limit: 100 });
  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .eq("status", "uploading");
  if (error) return { error: error.message };
  if (objects && objects.length > 0) {
    // Si esto falla, los archivos quedan huérfanos y los borra el cron.
    await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .remove(objects.map((o) => `${folder}/${o.name}`));
  }
  return { error: null };
}
