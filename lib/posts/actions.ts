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
import { captionSchema, commentSchema, confirmPostSchema, type ConfirmedMedia } from "./validation";
import type { PostComment } from "./types";
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

// Editar y borrar ------------------------------------------------------------

export type PostActionResult = { error: string | null };

/**
 * Editar una publicación ya publicada: sólo descripción y spoiler (los
 * archivos no se cambian). El trigger `posts_guard_update` marca `edited_at`.
 */
export async function updatePost(input: {
  postId: string;
  caption: string;
  isSpoiler: boolean;
}): Promise<PostActionResult & { editedAt?: string | null }> {
  const postId = uuidSchema.safeParse(input.postId);
  if (!postId.success) return { error: "Falta la publicación." };
  const caption = captionSchema.safeParse(input.caption ?? "");
  if (!caption.success)
    return { error: caption.error.issues[0]?.message ?? "Descripción inválida." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { data, error } = await supabase
    .from("posts")
    .update({ caption: caption.data, is_spoiler: Boolean(input.isSpoiler) })
    .eq("id", postId.data)
    .eq("user_id", user.id)
    .eq("status", "published")
    .select("game_id, edited_at")
    .maybeSingle();
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  if (!data) return { error: "Sólo podés editar tus publicaciones." };

  revalidateGallery(data.game_id);
  revalidatePath(`/publicaciones/${postId.data}`);
  return { error: null, editedAt: data.edited_at };
}

/**
 * Borrar una publicación propia: la fila (y en cascada archivos indexados,
 * likes y comentarios, y con ellos sus notificaciones de Recibido) y después
 * los archivos de Storage. Primero la fila: un archivo sin fila es invisible y
 * lo barre el cron; una fila sin archivo sería una imagen rota en el feed.
 */
export async function deletePost(postId: string): Promise<PostActionResult> {
  const parsed = uuidSchema.safeParse(postId);
  if (!parsed.success) return { error: "Falta la publicación." };
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { data: post } = await supabase
    .from("posts")
    .select("id, user_id, game_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!post || post.user_id !== user.id) return { error: "Sólo podés borrar tus publicaciones." };

  // Los paths salen de la carpeta del post (incluye miniaturas y posters), y
  // se leen ANTES de borrar la fila: después la policy de lectura ya no deja.
  const folder = `${user.id}/${post.id}`;
  const { data: objects } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .list(folder, { limit: 100 });

  const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("user_id", user.id);
  if (error) return { error: `No se pudo borrar: ${error.message}` };

  if (objects && objects.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .remove(objects.map((object) => `${folder}/${object.name}`));
    // No es un error para el usuario: el post ya no existe y el cron barre lo que quedó.
    if (removeError)
      console.error("[posts] no se pudieron borrar los archivos", removeError.message);
  }

  revalidateGallery(post.game_id);
  return { error: null };
}

// Likes ----------------------------------------------------------------------

/**
 * Me gusta en una publicación. Recibe el estado DESEADO, no un toggle (mismo
 * contrato que `setReviewLike`): el corazón es optimista y dos toques rápidos
 * tienen que terminar en lo que se ve. La propia no se likea (también lo corta
 * la RLS). Sin revalidar: el corazón lleva su propio estado y revalidar la
 * página que se está viendo haría esperar un re-render entero por toque.
 */
export async function setPostLike(postId: string, liked: boolean): Promise<PostActionResult> {
  const parsed = uuidSchema.safeParse(postId);
  if (!parsed.success) return { error: "Falta la publicación." };
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { data: post } = await supabase
    .from("posts")
    .select("id, user_id")
    .eq("id", parsed.data)
    .eq("status", "published")
    .maybeSingle();
  if (!post) return { error: "No encontramos esa publicación." };
  if (post.user_id === user.id)
    return { error: "No podés darle me gusta a tu propia publicación." };

  const { error } = liked
    ? await supabase
        .from("post_likes")
        .upsert(
          { post_id: post.id, user_id: user.id },
          { onConflict: "post_id,user_id", ignoreDuplicates: true },
        )
    : await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
  if (error) return { error: `No se pudo guardar el me gusta: ${error.message}` };
  return { error: null };
}

// Comentarios ----------------------------------------------------------------

export type AddCommentResult =
  { status: "ok"; comment: PostComment } | { status: "error"; message: string };

export async function addComment(postId: string, body: string): Promise<AddCommentResult> {
  const parsedId = uuidSchema.safeParse(postId);
  if (!parsedId.success) return { status: "error", message: "Falta la publicación." };
  const parsedBody = commentSchema.safeParse(body ?? "");
  if (!parsedBody.success) {
    return {
      status: "error",
      message: parsedBody.error.issues[0]?.message ?? "Comentario inválido.",
    };
  }
  const { supabase, user } = await requireUser();
  if (!user) return { status: "error", message: "Tenés que iniciar sesión." };

  const { data, error } = await supabase
    .from("post_comments")
    .insert({ post_id: parsedId.data, user_id: user.id, body: parsedBody.data })
    .select("id, body, created_at")
    .single();
  if (error || !data) {
    return { status: "error", message: `No se pudo comentar: ${error?.message ?? ""}` };
  }

  const { data: me } = await supabase
    .from("public_profiles")
    .select("display_name, profile_name, profile_avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  return {
    status: "ok",
    comment: {
      id: data.id,
      body: data.body,
      createdAt: data.created_at,
      author: {
        id: user.id,
        name: me?.profile_name ?? me?.display_name ?? "Vos",
        avatarUrl: me?.profile_avatar_url ?? null,
      },
      canDelete: true,
    },
  };
}

/** Borra un comentario: su autor o el autor del post (la RLS exige lo mismo). */
export async function deleteComment(commentId: string): Promise<PostActionResult> {
  const parsed = uuidSchema.safeParse(commentId);
  if (!parsed.success) return { error: "Falta el comentario." };
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { data: comment } = await supabase
    .from("post_comments")
    .select("id, user_id, posts!inner (user_id)")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!comment) return { error: "Ese comentario ya no existe." };
  if (comment.user_id !== user.id && comment.posts.user_id !== user.id) {
    return { error: "Sólo podés borrar tus comentarios o los de tus publicaciones." };
  }

  const { error } = await supabase.from("post_comments").delete().eq("id", comment.id);
  if (error) return { error: `No se pudo borrar el comentario: ${error.message}` };
  return { error: null };
}
