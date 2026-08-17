"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  generateAiGamePlan,
  AiProviderError,
  AiSchemaValidationError,
  type AiPlanInput,
} from "@/lib/ai";

export type AdvisorActionState = { error: string | null; success: string | null };

/**
 * Genera un plan nuevo con IA para el juego y lo guarda como fila nueva en
 * ai_game_plans (nunca pisa la anterior -- así queda el historial de versiones
 * y el botón "regenerar" simplemente dispara otra fila).
 */
export async function generateAdvisorPlan(
  _prevState: AdvisorActionState,
  formData: FormData,
): Promise<AdvisorActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) {
    return { error: "Falta el juego.", success: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión.", success: null };
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, name, platform")
    .eq("id", gameId)
    .single();
  if (gameError || !game) {
    return { error: "No se encontró el juego.", success: null };
  }

  const { data: trophies } = await supabase
    .from("trophies")
    .select("id, name, description, type, hidden")
    .eq("game_id", gameId);

  const { data: userTrophies } = await supabase
    .from("user_trophies")
    .select("trophy_id")
    .eq("user_id", user.id);
  const obtained = new Set((userTrophies ?? []).map((row) => row.trophy_id));

  const { data: guides } = await supabase
    .from("guides")
    .select("title, content_markdown")
    .eq("game_id", gameId);

  const input: AiPlanInput = {
    gameName: game.name,
    platform: game.platform ?? "Desconocida",
    trophies: (trophies ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      type: t.type as AiPlanInput["trophies"][number]["type"],
      hidden: t.hidden,
      obtained: obtained.has(t.id),
    })),
    guides: (guides ?? []).map((g) => ({
      title: g.title,
      contentMarkdown: g.content_markdown,
    })),
  };

  try {
    const plan = await generateAiGamePlan(input);
    await supabase.from("ai_game_plans").insert({
      game_id: gameId,
      user_id: user.id,
      payload_json: plan,
      model: "claude-sonnet-4-5",
      status: "ok",
    });
    revalidatePath(`/juegos/${gameId}/advisor`);
    return { error: null, success: "Plan generado." };
  } catch (cause) {
    const message =
      cause instanceof AiProviderError || cause instanceof AiSchemaValidationError
        ? cause.message
        : "No se pudo generar el plan.";
    await supabase.from("ai_game_plans").insert({
      game_id: gameId,
      user_id: user.id,
      payload_json: { error: message },
      model: "claude-sonnet-4-5",
      status: "error",
    });
    revalidatePath(`/juegos/${gameId}/advisor`);
    return { error: message, success: null };
  }
}
