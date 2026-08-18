"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  generateAiGamePlan,
  AiProviderError,
  AiSchemaValidationError,
  type AiGamePlan,
} from "@/lib/ai";

const MODEL = "openai/gpt-oss-120b";

export type AiPlanActionState = {
  plan: AiGamePlan | null;
  error: string | null;
};

/**
 * Genera un plan nuevo para el juego (issue "generar plan" + "botón regenerar"):
 * siempre inserta una fila nueva en ai_game_plans en vez de pisar la anterior,
 * así queda un historial versionado y el cacheo (última fila `ok`) sigue
 * sirviendo aunque una regeneración falle.
 */
export async function generateAiPlan(
  _prevState: AiPlanActionState,
  formData: FormData,
): Promise<AiPlanActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) {
    return { plan: null, error: "Falta el juego." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { plan: null, error: "Tenés que iniciar sesión." };
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, name, platform")
    .eq("id", gameId)
    .single();
  if (gameError || !game) {
    return { plan: null, error: "No se encontró el juego." };
  }

  const { data: trophies } = await supabase
    .from("trophies")
    .select("id, name, description, type, hidden")
    .eq("game_id", gameId);

  const PAGE_SIZE = 1000;
  const userTrophies: { trophy_id: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page } = await supabase
      .from("user_trophies")
      .select("trophy_id")
      .eq("user_id", user.id)
      .range(from, from + PAGE_SIZE - 1);
    userTrophies.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }
  const obtainedTrophyIds = new Set(userTrophies.map((row) => row.trophy_id));

  const { data: guides } = await supabase
    .from("guides")
    .select("title, content_markdown")
    .eq("game_id", gameId);

  try {
    const plan = await generateAiGamePlan({
      gameName: game.name,
      platform: game.platform ?? "",
      trophies: (trophies ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type as "bronze" | "silver" | "gold" | "platinum",
        hidden: t.hidden,
        obtained: obtainedTrophyIds.has(t.id),
      })),
      guides: (guides ?? []).map((g) => ({
        title: g.title,
        contentMarkdown: g.content_markdown,
      })),
    });

    await supabase.from("ai_game_plans").insert({
      game_id: gameId,
      user_id: user.id,
      payload_json: plan,
      model: MODEL,
      status: "ok",
    });

    revalidatePath(`/juegos/${gameId}`);
    return { plan, error: null };
  } catch (cause) {
    console.error("generateAiPlan failed:", cause);
    await supabase.from("ai_game_plans").insert({
      game_id: gameId,
      user_id: user.id,
      payload_json: {},
      model: MODEL,
      status: "error",
    });

    if (cause instanceof AiSchemaValidationError || cause instanceof AiProviderError) {
      return { plan: null, error: cause.message };
    }
    return { plan: null, error: "No se pudo generar el plan." };
  }
}
