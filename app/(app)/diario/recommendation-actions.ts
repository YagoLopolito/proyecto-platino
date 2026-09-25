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
 * Genera las recomendaciones de la Biblioteca (antes vivían en el diario) a partir de lo que el usuario jugó
 * (platinos, horas, puntajes del diario) en PSN, Steam y catálogo. Igual que
 * el advisor de un juego (`ai-actions.ts`): siempre inserta una fila nueva en `ai_recommendations`, así una regeneración fallida no borra
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

  if (candidates.played.length === 0 && candidates.library.length === 0) {
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
      played: candidates.played.map((game) => ({
        name: game.name,
        platform: game.platform ?? "",
        rating: game.rating,
        hours: game.hours,
        percent: game.percent,
        finished: game.finished,
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

    revalidatePath("/biblioteca");
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

export type DismissKeepPlayingResult = { error: string | null };

/**
 * Saca un juego de "Seguí jugando": el usuario decidió que no lo va a jugar
 * más. Vuelve solo si lo juega de nuevo: se guarda el `last_played_at` que
 * tenía el juego al sacarlo (no la hora actual, mismo criterio que
 * `dismissPlaySuggestion`), y una sesión posterior que traiga el sync lo
 * reactiva.
 *
 * Sin `revalidatePath`: la fila lo esconde sola (optimista), y revalidar la
 * biblioteca desde acá haría esperar su re-render entero.
 */
export async function dismissKeepPlaying(gameId: string): Promise<DismissKeepPlayingResult> {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) return { error: "Falta el juego." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { data: row } = await supabase
    .from("user_games")
    .select("last_played_at")
    .eq("user_id", user.id)
    .eq("game_id", gameId)
    .maybeSingle();

  const { error } = await supabase
    .from("user_games")
    .update({ keep_playing_dismissed_at: row?.last_played_at ?? new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("game_id", gameId);
  if (error) return { error: `No se pudo sacar el juego: ${error.message}` };
  return { error: null };
}
