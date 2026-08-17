import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AiProviderError, AiSchemaValidationError } from "./errors";
import { AI_PLAN_SYSTEM_PROMPT, buildAiPlanUserPrompt, type AiPlanInput } from "./prompt";
import { parseAiGamePlan, type AiGamePlan } from "./schema";

const MODEL = "claude-sonnet-4-5";

function getClient(): Anthropic {
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno AI_PROVIDER_API_KEY.");
  }
  return new Anthropic({ apiKey });
}

async function requestPlanCompletion(client: Anthropic, userPrompt: string): Promise<string> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: AI_PLAN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = response.content.find((c) => c.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("La respuesta del modelo no trajo contenido de texto.");
    }
    return block.text;
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
