"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { backfillCompletedDiaryEntries, backfillPlatinumDiaryEntries } from "@/lib/diary/backfill";
import { dbErrorMessage } from "@/lib/errors";

export type BackfillState = { error: string | null; message: string | null };

/**
 * Importa al diario los platinos de PSN y los juegos de Steam al 100% ya
 * sincronizados que todavía no tienen entrada (los "viejos", anteriores a la
 * auto-detección del sync). Es idempotente: volver a apretarlo no duplica nada.
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
    // Las dos fuentes en la misma acción: para el usuario es un solo botón
    // ("traeme lo que ya terminé"), y las condiciones son equivalentes aunque
    // se guarden en columnas distintas.
    const [platinums, completed] = await Promise.all([
      backfillPlatinumDiaryEntries(supabase, user.id),
      backfillCompletedDiaryEntries(supabase, user.id),
    ]);
    const result = {
      platinumsFound: platinums.platinumsFound + completed.platinumsFound,
      created: platinums.created + completed.created,
      linked: platinums.linked + completed.linked,
    };
    revalidatePath("/perfil/diario");
    revalidatePath("/diario/resumen");

    if (result.created === 0 && result.linked === 0) {
      return {
        error: null,
        message:
          result.platinumsFound === 0
            ? "No encontramos platinos ni juegos al 100% sincronizados. Sincronizá tu cuenta primero."
            : "Tus platinos y juegos al 100% ya estaban en el diario, no hizo falta agregar nada.",
      };
    }

    return {
      error: null,
      message: `Listo: ${result.created} entrada${result.created === 1 ? "" : "s"} nueva${
        result.created === 1 ? "" : "s"
      } y ${result.linked} ya existente${result.linked === 1 ? "" : "s"} marcada${
        result.linked === 1 ? "" : "s"
      }.`,
    };
  } catch (cause) {
    return {
      error: dbErrorMessage("diary.backfill", cause, "No se pudieron importar los platinos."),
      message: null,
    };
  }
}
