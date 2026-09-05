import "server-only";
import Groq from "groq-sdk";
import { AiProviderError, AiSchemaValidationError } from "./errors";
import {
  AI_PLAN_SYSTEM_PROMPT,
  buildAiPlanUserPrompt,
  TROPHY_HINT_SYSTEM_PROMPT,
  buildTrophyHintUserPrompt,
  GAME_DESCRIPTION_SYSTEM_PROMPT,
  buildGameDescriptionUserPrompt,
  AI_RECOMMENDATIONS_SYSTEM_PROMPT,
  buildAiRecommendationsUserPrompt,
  type AiPlanInput,
  type AiRecommendationsInput,
  type TrophyHintInput,
  type GameDescriptionInput,
} from "./prompt";
import {
  parseAiGamePlan,
  parseAiRecommendations,
  type AiGamePlan,
  type AiRecommendations,
} from "./schema";
import {
  AI_MOCKS_ENABLED,
  getMockAiGamePlan,
  getMockAiRecommendations,
  getMockTrophyHint,
} from "./mocks";

/** Modelo gratuito de Groq (free tier, sin tarjeta) usado para generar el plan en JSON. */
const MODEL = "openai/gpt-oss-120b";

function getClient(): Groq {
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  if (!apiKey) {
    throw new AiProviderError(new Error("Falta la variable de entorno AI_PROVIDER_API_KEY."));
  }
  return new Groq({ apiKey });
}

/** Una completion en modo JSON. Compartida por el plan de un juego y por el recomendador. */
async function requestJsonCompletion(
  client: Groq,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("La respuesta del modelo no trajo contenido de texto.");
    }
    return text;
  } catch (cause) {
    throw new AiProviderError(cause);
  }
}

function requestPlanCompletion(client: Groq, userPrompt: string): Promise<string> {
  return requestJsonCompletion(client, AI_PLAN_SYSTEM_PROMPT, userPrompt, 2800);
}

/**
 * Genera el plan de un juego llamando al LLM. Si la respuesta no matchea el
 * schema esperado, reintenta una única vez pidiéndole al modelo que corrija
 * el JSON; si vuelve a fallar, propaga AiSchemaValidationError (nunca un 500
 * silencioso: el caller decide cómo mostrarlo, ver PRODUCT_SPEC.md sección 4).
 */
export async function generateAiGamePlan(input: AiPlanInput): Promise<AiGamePlan> {
  if (AI_MOCKS_ENABLED) return getMockAiGamePlan(input);

  const client = getClient();
  const userPrompt = buildAiPlanUserPrompt(input);

  const firstAttempt = await requestPlanCompletion(client, userPrompt);
  try {
    return parseAiGamePlan(firstAttempt);
  } catch (firstError) {
    const retryPrompt = `${userPrompt}\n\nTu respuesta anterior no era JSON válido según el schema pedido:\n${firstAttempt}\n\nCorregila y devolvé SOLO el JSON válido, sin texto adicional.`;
    const secondAttempt = await requestPlanCompletion(client, retryPrompt);
    try {
      return parseAiGamePlan(secondAttempt);
    } catch (secondError) {
      throw new AiSchemaValidationError({ firstError, secondError });
    }
  }
}

/**
 * Explicación puntual de un solo trofeo (texto plano, no JSON): más barata y
 * rápida que regenerar el plan completo del juego, útil cuando la
 * descripción oficial de PSN es ambigua o insuficiente.
 */
export async function generateTrophyHint(input: TrophyHintInput): Promise<string> {
  if (AI_MOCKS_ENABLED) return getMockTrophyHint(input);

  const client = getClient();
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: TROPHY_HINT_SYSTEM_PROMPT },
        { role: "user", content: buildTrophyHintUserPrompt(input) },
      ],
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("La respuesta del modelo no trajo contenido de texto.");
    }
    return text;
  } catch (cause) {
    throw new AiProviderError(cause);
  }
}

/** Respuesta convenida del modelo cuando no conoce el juego (ver prompt). */
const UNKNOWN_GAME_MARKER = "NO_CONOZCO";

/**
 * Descripción corta del juego para la ficha del diario, cuando RAWG no tiene
 * ninguna. Devuelve null si el modelo admite no conocer el juego -- preferimos
 * quedarnos sin descripción antes que mostrar una inventada. El caller la
 * guarda marcada como generada por IA, y la UI lo aclara al usuario.
 */
export async function generateGameDescription(input: GameDescriptionInput): Promise<string | null> {
  const client = getClient();
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: GAME_DESCRIPTION_SYSTEM_PROMPT },
        { role: "user", content: buildGameDescriptionUserPrompt(input) },
      ],
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (!text || text.includes(UNKNOWN_GAME_MARKER)) return null;
    return text;
  } catch (cause) {
    throw new AiProviderError(cause);
  }
}

/**
 * Recomendaciones del diario a partir de los platinos/100% del usuario y de su
 * biblioteca en curso. Mismo contrato que `generateAiGamePlan`: un reintento
 * si el JSON no matchea el schema y, si vuelve a fallar, `AiSchemaValidationError`
 * para que el caller decida cómo mostrarlo.
 */
export async function generateAiRecommendations(
  input: AiRecommendationsInput,
): Promise<AiRecommendations> {
  if (AI_MOCKS_ENABLED) return getMockAiRecommendations(input);

  const client = getClient();
  const userPrompt = buildAiRecommendationsUserPrompt(input);

  const firstAttempt = await requestJsonCompletion(
    client,
    AI_RECOMMENDATIONS_SYSTEM_PROMPT,
    userPrompt,
    1600,
  );
  try {
    return parseAiRecommendations(firstAttempt);
  } catch (firstError) {
    const retryPrompt = `${userPrompt}

Tu respuesta anterior no era JSON válido según el schema pedido:
${firstAttempt}

Corregila y devolvé SOLO el JSON válido, sin texto adicional.`;
    const secondAttempt = await requestJsonCompletion(
      client,
      AI_RECOMMENDATIONS_SYSTEM_PROMPT,
      retryPrompt,
      1600,
    );
    try {
      return parseAiRecommendations(secondAttempt);
    } catch (secondError) {
      throw new AiSchemaValidationError({ firstError, secondError });
    }
  }
}
