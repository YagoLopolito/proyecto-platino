import { deflateSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Mismo prefijo que el resto de la suite: el teardown lo reconoce. */
export const E2E_CAPTION_PREFIX = "[E2E]";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Un PNG válido de un color (el navegador lo tiene que poder decodificar: el
 * compositor lo abre con `createImageBitmap`). Chico a propósito.
 */
export function makePng(width = 160, height = 90, rgb: [number, number, number] = [40, 90, 200]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Una publicación ya publicada, sembrada con service role (sin pasar por la
 * UI): para los tests de feed, grilla, likes y comentarios, que no prueban el
 * compositor. Sube `files` PNG reales al bucket privado.
 */
export async function seedPost(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    gameId: string;
    files?: number;
    caption?: string;
    isSpoiler?: boolean;
    publishedAt?: string;
  },
): Promise<{ postId: string; paths: string[] }> {
  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      user_id: opts.userId,
      game_id: opts.gameId,
      caption: `${E2E_CAPTION_PREFIX} ${opts.caption ?? "post de prueba"}`,
      is_spoiler: opts.isSpoiler ?? false,
    })
    .select("id")
    .single();
  if (error || !post) throw new Error(`No se pudo sembrar el post: ${error?.message}`);

  const paths: string[] = [];
  const rows = [];
  for (let position = 0; position < (opts.files ?? 1); position++) {
    const path = `${opts.userId}/${post.id}/${position}-${randomUUID()}.png`;
    const png = makePng(160, 90, [40 + position * 40, 90, 200]);
    const { error: uploadError } = await supabase.storage
      .from("post-media")
      .upload(path, png, { contentType: "image/png" });
    if (uploadError) throw new Error(`No se pudo subir el archivo: ${uploadError.message}`);
    paths.push(path);
    rows.push({
      post_id: post.id,
      position,
      storage_path: path,
      media_type: "image",
      mime_type: "image/png",
      width: 160,
      height: 90,
      size_bytes: png.length,
    });
  }
  const { error: mediaError } = await supabase.from("post_media").insert(rows);
  if (mediaError) throw new Error(`No se pudieron sembrar los archivos: ${mediaError.message}`);

  const { error: publishError } = await supabase
    .from("posts")
    .update({ status: "published", published_at: opts.publishedAt ?? new Date().toISOString() })
    .eq("id", post.id);
  if (publishError) throw new Error(`No se pudo publicar: ${publishError.message}`);
  return { postId: post.id, paths };
}

/** Archivos que quedan en la carpeta de un post (para verificar el borrado). */
export async function listPostObjects(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
): Promise<string[]> {
  const { data } = await supabase.storage.from("post-media").list(`${userId}/${postId}`);
  return (data ?? []).map((object) => object.name);
}
