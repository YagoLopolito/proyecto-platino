"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  generateAiRecommendations,
  AiProviderError,
  AiSchemaValidationError,
  type AiRecommendations,
} from "@/lib/ai";
import { getRecommendationCandidates } from "@/lib/diary/recommendations";

const MODEL = "openai/gpt-oss-120b";

export type RecommendationsActionState = {
  recommendations: AiRecommendations | null;
  error: string | null;
};

/**
 * Genera las recomendaciones del diario a partir de los platinos/100% del
 * usuario. Igual que el advisor de un juego (`ai-actions.ts`): siempre inserta
 * una fila nueva en `ai_recommendations`, así una regeneración fallida no borra
 * la última buena, que es lo que sigue mostrando la página.
 */
export async function generateRecommendations(
  _prevState: RecommendationsActionState,
  _formData: FormData,
): Promise<RecommendationsActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { recommendations: null, error: "Tenés que iniciar sesión." };
  }

  const candidates = await getRecommendationCandidates(supabase, user.id);

  if (candidates.platinums.length === 0 && candidates.library.length === 0) {
    return {
      recommendations: null,
      error:
        "Todavía no hay nada sobre qué recomendar: sincronizá tu cuenta de PSN o Steam para traer tus juegos.",
    };
  }

  // Mismo truco que el plan de un juego: el modelo referencia cada juego por
  // id, y un uuid de 36 caracteres repetido es caro en tokens (y más fácil de
  // alucinar mal). Se le pasan ids cortos y se remapean antes de guardar.
  const shortIdByRealId = new Map(candidates.library.map((game, i) => [game.id, `g${i + 1}`]));
  const realIdByShortId = new Map(candidates.library.map((game, i) => [`g${i + 1}`, game.id]));

  try {
    const raw = await generateAiRecommendations({
      platinums: candidates.platinums.map((game) => ({
        name: game.name,
        platform: game.platform ?? "",
        rating: game.rating,
      })),
      library: candidates.library.map((game) => ({
        id: shortIdByRealId.get(game.id)!,
        name: game.name,
        platform: game.platform ?? "",
        obtained: game.obtained,
        total: game.total,
      })),
      ownedNames: candidates.ownedNames,
    });

    const recommendations: AiRecommendations = {
      ...raw,
      // Si el modelo inventó un id que no existe, la entrada se descarta en vez
      // de guardarse apuntando a nada: la UI necesita resolver el juego real
      // para mostrar carátula y progreso.
      seguir_jugando: raw.seguir_jugando.flatMap((item) => {
        const realId = realIdByShortId.get(item.juego_id);
        return realId ? [{ ...item, juego_id: realId }] : [];
      }),
    };

    await supabase.from("ai_recommendations").insert({
      user_id: user.id,
      payload_json: recommendations,
      model: MODEL,
      status: "ok",
    });

    revalidatePath("/diario");
    return { recommendations, error: null };
  } catch (cause) {
    console.error("generateRecommendations failed:", cause);
    await supabase.from("ai_recommendations").insert({
      user_id: user.id,
      payload_json: {},
      model: MODEL,
      status: "error",
    });

    if (cause instanceof AiSchemaValidationError || cause instanceof AiProviderError) {
      return { recommendations: null, error: cause.message };
    }
    return { recommendations: null, error: "No se pudieron generar las recomendaciones." };
  }
}
