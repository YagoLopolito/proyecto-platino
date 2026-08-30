"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  generateAiGamePlan,
  AiProviderError,
  AiSchemaValidationError,
  type AiGamePlan,
  type AiPlanTrophyInput,
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
    .select("id, name, description, type, hidden, trophy_group_id")
    .eq("game_id", gameId);

  // Excluye trofeos de DLC/expansiones (trophy_group_id distinto de "default")
  // del prompt: no cuentan para el platino del juego base y en títulos con
  // mucho contenido descargable inflan el prompt hasta pasar el límite de
  // tokens del proveedor de IA. Los trofeos sincronizados antes de que
  // existiera esta columna quedan con trophy_group_id null -- se incluyen
  // igual para no perder cobertura hasta que se vuelvan a sincronizar.
  const basePlanTrophies = (trophies ?? []).filter(
    (t) => t.trophy_group_id === null || t.trophy_group_id === "default",
  );

  const PAGE_SIZE = 1000;
  const userTrophies: { trophy_id: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page } = await supabase
      .from("user_trophies")
      .select("trophy_id")
      .eq("user_id", user.id)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    userTrophies.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }
  const obtainedTrophyIds = new Set(userTrophies.map((row) => row.trophy_id));

  const { data: guides } = await supabase
    .from("guides")
    .select("title, content_markdown")
    .eq("game_id", gameId);

  // El modelo referencia cada trofeo por id en varios arrays de la respuesta
  // (orden_sugerido, missables, modos, desafios_de_dificultad, siguiente_trofeo,
  // grupos_de_partidas). Un uuid completo (36 caracteres) repetido decenas
  // de veces infla el output y, en juegos
  // con muchos trofeos pendientes, puede truncar el JSON antes de que
  // termine de generarse -- eso dispara el reintento de generateAiGamePlan
  // y duplica la latencia, arriesgando el timeout de la función serverless.
  // Un id corto ("t1", "t2", ...) es prácticamente gratis en tokens; se
  // mapea de vuelta al uuid real antes de guardar el plan.
  const shortIdByRealId = new Map(basePlanTrophies.map((t, i) => [t.id, `t${i + 1}`]));
  const realIdByShortId = new Map(basePlanTrophies.map((t, i) => [`t${i + 1}`, t.id]));

  function remapTrophyId(shortId: string): string {
    return realIdByShortId.get(shortId) ?? shortId;
  }

  try {
    const rawPlan = await generateAiGamePlan({
      gameName: game.name,
      platform: game.platform ?? "",
      trophies: basePlanTrophies.map((t) => ({
        id: shortIdByRealId.get(t.id)!,
        name: t.name,
        description: t.description,
        type: t.type as AiPlanTrophyInput["type"],
        hidden: t.hidden,
        obtained: obtainedTrophyIds.has(t.id),
      })),
      guides: (guides ?? []).map((g) => ({
        title: g.title,
        contentMarkdown: g.content_markdown,
      })),
    });

    const plan: AiGamePlan = {
      ...rawPlan,
      grupos_de_partidas: rawPlan.grupos_de_partidas.map((grupo) => ({
        ...grupo,
        trofeos_relacionados: grupo.trofeos_relacionados.map(remapTrophyId),
      })),
      missables: rawPlan.missables.map((m) => ({ ...m, trofeo_id: remapTrophyId(m.trofeo_id) })),
      orden_sugerido: rawPlan.orden_sugerido.map(remapTrophyId),
      siguiente_trofeo: rawPlan.siguiente_trofeo
        ? {
            ...rawPlan.siguiente_trofeo,
            trofeo_id: remapTrophyId(rawPlan.siguiente_trofeo.trofeo_id),
          }
        : null,
      desafios_de_dificultad: (rawPlan.desafios_de_dificultad ?? []).map((d) => ({
        ...d,
        trofeo_id: remapTrophyId(d.trofeo_id),
      })),
      modos: (rawPlan.modos ?? []).map((grupo) => ({
        ...grupo,
        trofeos_relacionados: grupo.trofeos_relacionados.map(remapTrophyId),
      })),
    };

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
