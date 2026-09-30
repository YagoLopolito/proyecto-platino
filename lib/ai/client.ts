import "server-only";
import Groq from "groq-sdk";
import { AiProviderError, AiSchemaValidationError } from "./errors";
import {
  TIME_ESTIMATES_SYSTEM_PROMPT,
  buildTimeEstimatesUserPrompt,
  type TimeEstimatesInput,
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
  parseAiTimeEstimates,
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
 * Tiempos estimados de juego (historia y 100%) para los títulos que IGDB no
 * tiene. Es la fuente de último recurso de `lib/time-to-beat/`, y por eso la
 * UI los muestra etiquetados como estimación de IA: son menos confiables que
 * los agregados de la comunidad que publica IGDB.
 *
 * Devuelve `null` cuando el modelo admite no conocer el juego, cuando el JSON
 * no valida (acá no se reintenta: es un dato decorativo, no vale una segunda
 * llamada por ficha) o cuando el juego no tiene final -- un multijugador o un
 * roguelike no tiene "horas para terminarlo".
 *
 * Las horas vuelven convertidas a minutos, que es la unidad de las columnas.
 */
export async function generateTimeEstimates(
  input: TimeEstimatesInput,
): Promise<{ beatMinutes: number | null; completeMinutes: number | null } | null> {
  const client = getClient();
  let text: string | undefined;
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 120,
      reasoning_effort: "low",
      // Mismo juego, mismo número: sin esto dos fichas del mismo título
      // (PSN y Steam) podían mostrar tiempos distintos.
      temperature: 0,
      messages: [
        { role: "system", content: TIME_ESTIMATES_SYSTEM_PROMPT },
        { role: "user", content: buildTimeEstimatesUserPrompt(input) },
      ],
    });
    text = response.choices[0]?.message?.content?.trim();
  } catch (cause) {
    throw new AiProviderError(cause);
  }

  if (!text || text.includes(UNKNOWN_GAME_MARKER)) return null;

  try {
    const { historia, completo } = parseAiTimeEstimates(extractJsonObject(text));
    const beatMinutes = historia > 0 ? historia * 60 : null;
    let completeMinutes = completo > 0 ? completo * 60 : null;
    if (beatMinutes === null && completeMinutes === null) return null;
    // El modelo a veces invierte los dos números; el 100% nunca es más corto.
    if (beatMinutes !== null && completeMinutes !== null && completeMinutes < beatMinutes) {
      completeMinutes = beatMinutes;
    }
    return { beatMinutes, completeMinutes };
  } catch {
    // El modelo contestó algo que no es el JSON pedido: se descarta en
    // silencio, igual que una descripción que no se pudo generar.
    return null;
  }
}

/**
 * El modelo a veces envuelve el JSON en un bloque de markdown pese al prompt.
 * Se recorta al primer objeto que aparezca en el texto.
 */
function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end > start ? text.slice(start, end + 1) : text;
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
