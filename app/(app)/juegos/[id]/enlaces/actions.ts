"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { populateExternalGuidesForGame } from "@/lib/external-guides";

export type FindExternalGuidesState = {
  inserted: number | null;
  errors: string[];
};

export async function findExternalGuides(
  _prevState: FindExternalGuidesState,
  formData: FormData,
): Promise<FindExternalGuidesState> {
  const gameId = String(formData.get("gameId") ?? "");
  const gameName = String(formData.get("gameName") ?? "");
  if (!gameId || !gameName) {
    return { inserted: null, errors: ["Falta el juego."] };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { inserted: null, errors: ["Tenés que iniciar sesión."] };
  }

  try {
    const result = await populateExternalGuidesForGame(gameId, gameName);
    revalidatePath(`/juegos/${gameId}/enlaces`);
    return result;
  } catch (cause) {
    console.error("findExternalGuides failed:", cause);
    const message =
      cause instanceof Error ? cause.message : "Falló la búsqueda de enlaces externos.";
    return { inserted: null, errors: [message] };
  }
}
