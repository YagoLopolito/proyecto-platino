"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_CAPTION_LENGTH,
  MAX_SCREENSHOTS_PER_IMPORT,
  SCREENSHOTS_BUCKET,
} from "@/lib/diary/screenshot-constants";

export interface ImportedScreenshotItem {
  gameId: string;
  path: string;
  caption?: string | null;
}

export type ImportScreenshotsState = {
  error: string | null;
  success?: string | null;
  imported?: number;
};

/**
 * Indexa capturas que el browser ya subió a Storage, cada una con el juego que
 * le asignó el importador (`/diario/capturas`). Es el equivalente masivo de
 * `registerScreenshots`: mismas dos capas de validación (el prefijo del path
 * tiene que ser el uuid del usuario acá, y además lo corta la policy de
 * `storage.objects`), pero abarcando varios juegos en una sola llamada.
 */
export async function registerImportedScreenshots(input: {
  items: ImportedScreenshotItem[];
}): Promise<ImportScreenshotsState> {
  const { items } = input;

  if (items.length === 0) {
    return { error: "No se subió ninguna captura." };
  }
  if (items.length > MAX_SCREENSHOTS_PER_IMPORT) {
    return { error: `Se pueden importar hasta ${MAX_SCREENSHOTS_PER_IMPORT} capturas por vez.` };
  }
  if (items.some((item) => !item.gameId)) {
    return { error: "Hay capturas sin juego asignado." };
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
      game_id: item.gameId,
      storage_path: item.path,
      caption: normalizeCaption(item.caption),
    })),
  );

  if (error) {
    // Mismo criterio que `registerScreenshots`: si no quedaron indexadas, los
    // archivos se borran para no dejar basura huérfana en el bucket.
    await supabase.storage.from(SCREENSHOTS_BUCKET).remove(items.map((item) => item.path));
    return { error: `No se pudieron guardar las capturas: ${error.message}` };
  }

  for (const gameId of new Set(items.map((item) => item.gameId))) {
    revalidatePath(`/juegos/${gameId}/diario`);
  }

  return {
    error: null,
    imported: items.length,
    success: items.length === 1 ? "1 captura importada." : `${items.length} capturas importadas.`,
  };
}

function normalizeCaption(caption: string | null | undefined): string | null {
  const trimmed = String(caption ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CAPTION_LENGTH);
}
