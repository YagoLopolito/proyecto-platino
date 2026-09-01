import "server-only";

export {
  AI_PLAN_SYSTEM_PROMPT,
  buildAiPlanUserPrompt,
  INPUT_TOKEN_BUDGET,
} from "./plan-prompt";
export type { AiPlanTrophyInput, AiPlanGuideInput, AiPlanInput } from "./plan-prompt";

export type TrophyHintInput = {
  gameName: string;
  platform: string;
  trophyName: string;
  trophyDescription: string | null;
  trophyType: "bronze" | "silver" | "gold" | "platinum" | "achievement";
  hidden: boolean;
};

/**
 * A diferencia del plan completo, esto pide texto plano (no JSON): es una
 * explicación puntual de un solo trofeo, más barata y rápida de generar.
 */
export const TROPHY_HINT_SYSTEM_PROMPT = `Sos un asistente experto en trofeos de PlayStation. Te paso el nombre y la descripción oficial de UN solo trofeo (a veces ambigua o poco clara) y respondés, en español, con los pasos CONCRETOS y prácticos para desbloquearlo.

Reglas:
- Respondé en texto plano, sin JSON ni markdown, en 2 a 4 oraciones como máximo.
- Sé específico y accionable: qué hacer, dónde, y en qué momento del juego si aplica.
- Si el trofeo parece perdible (missable) por un punto de no retorno o una decisión única, decilo explícitamente y en qué momento hay que conseguirlo.
- Si no conocés el juego con precisión, decilo honestamente en vez de inventar pasos falsos.`;

export function buildTrophyHintUserPrompt(input: TrophyHintInput): string {
  return [
    `Juego: ${input.gameName} (${input.platform})`,
    `Trofeo: ${input.trophyName}`,
    `Tipo: ${input.trophyType}${input.hidden ? " (oculto)" : ""}`,
    `Descripción oficial: ${input.trophyDescription ?? "(sin descripción)"}`,
    "",
    "¿Qué hay que hacer exactamente para desbloquear este trofeo?",
  ].join("\n");
}

export interface GameDescriptionInput {
  gameName: string;
  platform: string | null;
  releaseYear: number | null;
  developer: string | null;
}

export const GAME_DESCRIPTION_SYSTEM_PROMPT = `Sos un redactor de fichas de videojuegos. Te paso el nombre de un juego de PlayStation y escribís una descripción corta, en español neutro, para la ficha del juego.

Reglas:
- 2 a 4 oraciones, texto plano, sin markdown, sin títulos ni listas.
- Contá de qué va el juego: género, ambientación y qué hace el jugador.
- Nada de opiniones, puntajes ni frases de marketing ("imperdible", "la mejor experiencia").
- No inventes datos concretos (fechas, estudios, ventas, modos) si no estás seguro.
- Si no conocés el juego, respondé exactamente: NO_CONOZCO`;

export function buildGameDescriptionUserPrompt(input: GameDescriptionInput): string {
  return [
    `Juego: ${input.gameName}`,
    input.platform ? `Plataforma: ${input.platform}` : null,
    input.releaseYear !== null ? `Año: ${input.releaseYear}` : null,
    input.developer ? `Desarrolladora: ${input.developer}` : null,
    "",
    "Escribí la descripción para la ficha.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
