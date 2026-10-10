"use server";

import { createClient } from "@/lib/supabase/server";
import { generateTrophyHint, AiProviderError } from "@/lib/ai";
import { logDbError } from "@/lib/errors";
import { TROPHY_HINT_LIMITS, formatCooldown, slidingWindowRemainingMs } from "@/lib/sync/cooldown";
import type { TrophyType } from "@/components/TrophyTypeIcon";

export type TrophyHintState = {
  hint: string | null;
  error: string | null;
};

/**
 * Explica cómo desbloquear un trofeo puntual. El estado de "obtenido" ya no
 * se edita a mano: viene siempre del sync con la cuenta PSN real (ver
 * CLAUDE.md), así que esta acción reemplaza al viejo toggle manual con algo
 * más útil cuando la descripción oficial es ambigua.
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

  // Freno por usuario (#235): el free tier de Groq es por organización, y un
  // usuario en loop lo dejaba caído para todos. Se cuentan los pedidos de la
  // ventana más larga y se anota este ANTES de llamar al proveedor: un pedido
  // que falla también le pegó a Groq.
  const longestWindowMs = Math.max(...TROPHY_HINT_LIMITS.map((limit) => limit.windowMs));
  const maxInWindow = Math.max(...TROPHY_HINT_LIMITS.map((limit) => limit.max));
  const { data: usage, error: usageError } = await supabase
    .from("ai_usage")
    .select("created_at")
    .eq("user_id", user.id)
    .eq("kind", "trophy_hint")
    .gte("created_at", new Date(Date.now() - longestWindowMs).toISOString())
    .order("created_at", { ascending: false })
    .limit(maxInWindow);
  if (usageError) {
    logDbError("explainTrophy.usage", usageError);
    return { hint: null, error: "No se pudo generar la ayuda." };
  }
  const remainingMs = slidingWindowRemainingMs(
    (usage ?? []).map((row) => row.created_at),
    TROPHY_HINT_LIMITS,
  );
  if (remainingMs > 0) {
    return {
      hint: null,
      error: `Pediste muchas ayudas seguidas. Podés pedir otra en ${formatCooldown(remainingMs)}.`,
    };
  }
  const { error: recordError } = await supabase
    .from("ai_usage")
    .insert({ user_id: user.id, kind: "trophy_hint" });
  if (recordError) {
    logDbError("explainTrophy.record", recordError);
    return { hint: null, error: "No se pudo generar la ayuda." };
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
