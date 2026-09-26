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
  if (!gameId) {
    return { inserted: null, errors: ["Falta el juego."] };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { inserted: null, errors: ["Tenés que iniciar sesión."] };
  }

  // Lo que se escribe va por service role (bypassea RLS) y lo ve todo el
  // mundo: el nombre sale de `games`, nunca del form, así nadie puede colar
  // un título arbitrario ni apuntar a un juego que no existe. No se exige que
  // esté en `user_games`: desde #186 cualquier juego tiene ficha, y estos
  // enlaces son datos del catálogo compartido.
  const { data: game } = await supabase
    .from("games")
    .select("id, name")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) {
    return { inserted: null, errors: ["No se encontró el juego."] };
  }

  try {
    const result = await populateExternalGuidesForGame(game.id, game.name);
    revalidatePath(`/juegos/${gameId}`, "layout");
    return result;
  } catch (cause) {
    console.error("findExternalGuides failed:", cause);
    const message =
      cause instanceof Error ? cause.message : "Falló la búsqueda de enlaces externos.";
    return { inserted: null, errors: [message] };
  }
}
