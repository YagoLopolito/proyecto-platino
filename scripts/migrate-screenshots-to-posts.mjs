/**
 * Migra la galería de capturas vieja (`game_screenshots` + bucket público
 * `game-screenshots`) a la Galería online (`posts` + bucket privado
 * `post-media`). Cada captura pasa a ser una publicación de un archivo, con su
 * descripción y su fecha original.
 *
 *   node scripts/migrate-screenshots-to-posts.mjs            # migra
 *   node scripts/migrate-screenshots-to-posts.mjs --dry-run  # sólo muestra qué haría
 *
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.local (o del
 * entorno). Usa service role: Storage no copia archivos entre buckets por SQL,
 * y cada captura es de otro usuario.
 *
 * Es idempotente: cada captura migrada se borra de `game_screenshots` y del
 * bucket viejo, así que si se corta a la mitad se puede volver a correr. Al
 * final borra el bucket viejo si quedó vacío. Recién después de esto se aplica
 * la migración `20261004000300_drop_game_screenshots.sql`, que se niega a
 * correr si queda alguna captura sin migrar.
 *
 * El derivado liviano (`display_path`) no se genera acá (haría falta un
 * decodificador de imágenes en Node): esas publicaciones muestran el original
 * también en el feed, que para un puñado de capturas no importa.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const dryRun = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const OLD_BUCKET = "game-screenshots";
const NEW_BUCKET = "post-media";
const EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Tipo y dimensiones leyendo la cabecera (JPEG, PNG, WebP; AVIF sin dimensiones). */
function inspect(bytes) {
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          type: "image/jpeg",
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }
      offset += 2 + length;
    }
    return { type: "image/jpeg", width: null, height: null };
  }
  if (bytes[0] === 0x89 && ascii(1, 3) === "PNG") {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    return { type: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { type: "image/webp", width: w, height: h };
    }
    if (chunk === "VP8 ") {
      return {
        type: "image/webp",
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const b = bytes.subarray(21, 25);
      return {
        type: "image/webp",
        width: 1 + (((b[1] & 0x3f) << 8) | b[0]),
        height: 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)),
      };
    }
    return { type: "image/webp", width: null, height: null };
  }
  if (ascii(4, 4) === "ftyp") return { type: "image/avif", width: null, height: null };
  return null;
}

const { data: rows, error } = await supabase
  .from("game_screenshots")
  .select("id, user_id, game_id, storage_path, caption, created_at")
  .order("created_at");
if (error) {
  console.error(`No se pudo leer game_screenshots: ${error.message}`);
  process.exit(1);
}
console.log(`${rows.length} capturas para migrar${dryRun ? " (dry run)" : ""}.`);

let migrated = 0;
for (const row of rows) {
  const { data: blob, error: downloadError } = await supabase.storage
    .from(OLD_BUCKET)
    .download(row.storage_path);
  if (downloadError || !blob) {
    console.error(`✗ ${row.id}: no se pudo bajar ${row.storage_path} (${downloadError?.message})`);
    continue;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const info = inspect(bytes);
  if (!info) {
    console.error(`✗ ${row.id}: formato no reconocido, se deja sin migrar.`);
    continue;
  }
  // Sin dimensiones (AVIF, un JPEG raro) se asume 16:9, el formato de las
  // capturas de consola: sólo afecta el marco del carrusel, no la imagen.
  const width = info.width ?? 1920;
  const height = info.height ?? 1080;

  if (dryRun) {
    console.log(`· ${row.id} → ${info.type} ${width}×${height}, ${bytes.length} bytes`);
    continue;
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      user_id: row.user_id,
      game_id: row.game_id,
      caption: row.caption,
      created_at: row.created_at,
    })
    .select("id")
    .single();
  if (postError || !post) {
    console.error(`✗ ${row.id}: no se pudo crear el post (${postError?.message})`);
    continue;
  }

  const storagePath = `${row.user_id}/${post.id}/0-${randomUUID()}.${EXTENSION[info.type]}`;
  const { error: uploadError } = await supabase.storage
    .from(NEW_BUCKET)
    .upload(storagePath, bytes, { contentType: info.type, cacheControl: "3600" });
  const { error: mediaError } = uploadError
    ? { error: uploadError }
    : await supabase.from("post_media").insert({
        post_id: post.id,
        position: 0,
        storage_path: storagePath,
        media_type: "image",
        mime_type: info.type,
        width,
        height,
        size_bytes: bytes.length,
      });
  const { error: publishError } = mediaError
    ? { error: mediaError }
    : await supabase
        .from("posts")
        .update({ status: "published", published_at: row.created_at })
        .eq("id", post.id);
  if (publishError) {
    console.error(`✗ ${row.id}: ${publishError.message}. Se deshace.`);
    await supabase.from("posts").delete().eq("id", post.id);
    await supabase.storage.from(NEW_BUCKET).remove([storagePath]);
    continue;
  }

  await supabase.from("game_screenshots").delete().eq("id", row.id);
  await supabase.storage.from(OLD_BUCKET).remove([row.storage_path]);
  migrated++;
  console.log(`✓ ${row.id} → publicación ${post.id}`);
}

if (!dryRun) {
  const { count } = await supabase
    .from("game_screenshots")
    .select("id", { count: "exact", head: true });
  if (count === 0) {
    const { data: leftovers } = await supabase.storage.from(OLD_BUCKET).list("", { limit: 1000 });
    for (const folder of leftovers ?? []) {
      const { data: files } = await supabase.storage
        .from(OLD_BUCKET)
        .list(folder.name, { limit: 1000 });
      for (const sub of files ?? []) {
        const { data: inner } = await supabase.storage
          .from(OLD_BUCKET)
          .list(`${folder.name}/${sub.name}`, { limit: 1000 });
        await supabase.storage
          .from(OLD_BUCKET)
          .remove((inner ?? []).map((file) => `${folder.name}/${sub.name}/${file.name}`));
      }
    }
    const { error: bucketError } = await supabase.storage.deleteBucket(OLD_BUCKET);
    console.log(
      bucketError
        ? `El bucket viejo no se pudo borrar: ${bucketError.message}`
        : "Bucket game-screenshots borrado.",
    );
  }
  console.log(`Listo: ${migrated} de ${rows.length} migradas.`);
}
