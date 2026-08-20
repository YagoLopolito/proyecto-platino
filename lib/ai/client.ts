import "server-only";
import Groq from "groq-sdk";
import { AiProviderError, AiSchemaValidationError } from "./errors";
import {
  AI_PLAN_SYSTEM_PROMPT,
  buildAiPlanUserPrompt,
  TROPHY_HINT_SYSTEM_PROMPT,
  buildTrophyHintUserPrompt,
  type AiPlanInput,
  type TrophyHintInput,
} from "./prompt";
import { parseAiGamePlan, type AiGamePlan } from "./schema";

/** Modelo gratuito de Groq (free tier, sin tarjeta) usado para generar el plan en JSON. */
const MODEL = "openai/gpt-oss-120b";

function getClient(): Groq {
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  if (!apiKey) {
    throw new AiProviderError(new Error("Falta la variable de entorno AI_PROVIDER_API_KEY."));
  }
  return new Groq({ apiKey });
}

async function requestPlanCompletion(client: Groq, userPrompt: string): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 2800,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      messages: [
        { role: "system", content: AI_PLAN_SYSTEM_PROMPT },
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

/**
 * Genera el plan de un juego llamando al LLM. Si la respuesta no matchea el
 * schema esperado, reintenta una única vez pidiéndole al modelo que corrija
 * el JSON; si vuelve a fallar, propaga AiSchemaValidationError (nunca un 500
 * silencioso: el caller decide cómo mostrarlo, ver PRODUCT_SPEC.md sección 4).
 */
export async function generateAiGamePlan(input: AiPlanInput): Promise<AiGamePlan> {
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
