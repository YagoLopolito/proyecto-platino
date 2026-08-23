"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_CAPTION_LENGTH,
  MAX_SCREENSHOTS_PER_UPLOAD,
  SCREENSHOTS_BUCKET,
} from "@/lib/diary/screenshot-constants";

export type ScreenshotActionState = { error: string | null; success?: string | null };

/**
 * Registra en `game_screenshots` archivos que el browser ya subió a Storage.
 * La subida va directo del cliente al bucket (un Server Action tiene límite de
 * body y una captura pesa varios MB); acá se valida que el path pertenezca al
 * usuario antes de indexarlo, para que nadie pueda hacerse dueño de un archivo
 * ajeno mandando un path arbitrario.
 */
export async function registerScreenshots(input: {
  gameId: string;
  items: { path: string; caption?: string | null }[];
}): Promise<ScreenshotActionState> {
  const { gameId, items } = input;

  if (!gameId) {
    return { error: "Falta el juego." };
  }
  if (items.length === 0) {
    return { error: "No se subió ninguna captura." };
  }
  if (items.length > MAX_SCREENSHOTS_PER_UPLOAD) {
    return { error: `Se pueden subir hasta ${MAX_SCREENSHOTS_PER_UPLOAD} capturas por vez.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const prefix = `${user.id}/`;
  if (items.some((item) => !item.path.startsWith(prefix))) {
    return { error: "Alguna captura no te pertenece." };
  }

  const { error } = await supabase.from("game_screenshots").insert(
    items.map((item) => ({
      user_id: user.id,
      game_id: gameId,
      storage_path: item.path,
      caption: normalizeCaption(item.caption),
    })),
  );

  if (error) {
    // El archivo ya está en Storage pero no quedó indexado: sacarlo para no
    // dejar basura huérfana que nadie va a ver ni poder borrar desde la UI.
    await supabase.storage.from(SCREENSHOTS_BUCKET).remove(items.map((item) => item.path));
    return { error: `No se pudo guardar la captura: ${error.message}` };
  }

  revalidatePath(`/juegos/${gameId}/diario`);
  return {
    error: null,
    success: items.length === 1 ? "Captura subida." : `${items.length} capturas subidas.`,
  };
}

export async function updateScreenshotCaption(input: {
  gameId: string;
  screenshotId: string;
  caption: string;
}): Promise<ScreenshotActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const { error } = await supabase
    .from("game_screenshots")
    .update({ caption: normalizeCaption(input.caption) })
    .eq("id", input.screenshotId)
    .eq("user_id", user.id);

  if (error) {
    return { error: `No se pudo guardar el texto: ${error.message}` };
  }

  revalidatePath(`/juegos/${input.gameId}/diario`);
  return { error: null, success: "Texto actualizado." };
}

/**
 * Borra la fila y el archivo. Primero la fila (si la RLS dice que no es del
 * usuario, no se toca Storage) y después el objeto; si el borrado del archivo
 * falla queda huérfano en el bucket, pero nunca al revés -- una fila apuntando
 * a un archivo que ya no existe sería una imagen rota en la galería pública.
 */
export async function deleteScreenshot(input: {
  gameId: string;
  screenshotId: string;
}): Promise<ScreenshotActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const { data: deleted, error } = await supabase
    .from("game_screenshots")
    .delete()
    .eq("id", input.screenshotId)
    .eq("user_id", user.id)
    .select("storage_path")
    .maybeSingle();

  if (error) {
    return { error: `No se pudo borrar la captura: ${error.message}` };
  }
  if (!deleted) {
    return { error: "Esa captura no existe o no es tuya." };
  }

  await supabase.storage.from(SCREENSHOTS_BUCKET).remove([deleted.storage_path]);

  revalidatePath(`/juegos/${input.gameId}/diario`);
  return { error: null, success: "Captura borrada." };
}

function normalizeCaption(caption: string | null | undefined): string | null {
  const trimmed = String(caption ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CAPTION_LENGTH);
}
