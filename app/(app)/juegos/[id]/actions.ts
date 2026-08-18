"use server";

import { createClient } from "@/lib/supabase/server";
import { generateTrophyHint, AiProviderError } from "@/lib/ai";
import type { TrophyType } from "@/components/TrophyTypeIcon";

export type TrophyHintState = {
  hint: string | null;
  error: string | null;
};

/**
 * Explica cómo desbloquear un trofeo puntual. El estado de "obtenido" ya no
 * se edita a mano: viene siempre del sync con la cuenta PSN real (ver
 * CLAUDE.md), así que esta acción reemplaza al viejo toggle manual con algo
 * más útil quando la descripción oficial es ambigua.
 */
export async function explainTrophy(
  _prevState: TrophyHintState,
  formData: FormData,
): Promise<TrophyHintState> {
  const gameId = String(formData.get("gameId") ?? "");
  const trophyId = String(formData.get("trophyId") ?? "");
  if (!gameId || !trophyId) {
    return { hint: null, error: "Falta el trofeo o el juego." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { hint: null, error: "Tenés que iniciar sesión." };
  }

  const [{ data: game }, { data: trophy }] = await Promise.all([
    supabase.from("games").select("name, platform").eq("id", gameId).single(),
    supabase
      .from("trophies")
      .select("name, description, type, hidden")
      .eq("id", trophyId)
      .eq("game_id", gameId)
      .single(),
  ]);

  if (!game || !trophy) {
    return { hint: null, error: "No se encontró el trofeo." };
  }

  try {
    const hint = await generateTrophyHint({
      gameName: game.name,
      platform: game.platform ?? "",
      trophyName: trophy.name,
      trophyDescription: trophy.description,
      trophyType: trophy.type as TrophyType,
      hidden: trophy.hidden,
    });
    return { hint, error: null };
  } catch (cause) {
    console.error("explainTrophy failed:", cause);
    if (cause instanceof AiProviderError) {
      return { hint: null, error: cause.message };
    }
    return { hint: null, error: "No se pudo generar la ayuda." };
  }
}
