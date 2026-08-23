"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { backfillPlatinumDiaryEntries } from "@/lib/diary/backfill";

export type BackfillState = { error: string | null; message: string | null };

/**
 * Importa al diario los platinos ya sincronizados que todavía no tienen entrada
 * (los "viejos", anteriores a la auto-detección del sync). Es idempotente:
 * volver a apretarlo no duplica nada.
 */
export async function importPlatinumsToDiary(
  _prevState: BackfillState,
  _formData: FormData,
): Promise<BackfillState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tenés que iniciar sesión.", message: null };
  }

  try {
    const result = await backfillPlatinumDiaryEntries(supabase, user.id);
    revalidatePath("/diario");
    revalidatePath("/diario/resumen");

    if (result.created === 0 && result.linked === 0) {
      return {
        error: null,
        message:
          result.platinumsFound === 0
            ? "No encontramos platinos sincronizados. Sincronizá tu cuenta PSN primero."
            : "Tus platinos ya estaban en el diario, no hizo falta agregar nada.",
      };
    }

    return {
      error: null,
      message: `Listo: ${result.created} entrada${result.created === 1 ? "" : "s"} nueva${
        result.created === 1 ? "" : "s"
      } y ${result.linked} ya existente${result.linked === 1 ? "" : "s"} marcada${
        result.linked === 1 ? "" : "s"
      } como platinada${result.linked === 1 ? "" : "s"}.`,
    };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "error desconocido";
    return { error: `No se pudieron importar los platinos: ${detail}`, message: null };
  }
}
