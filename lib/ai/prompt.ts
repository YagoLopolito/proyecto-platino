import "server-only";

export type AiPlanTrophyInput = {
  id: string;
  name: string;
  description: string | null;
  type: "bronze" | "silver" | "gold" | "platinum";
  hidden: boolean;
  obtained: boolean;
};

export type AiPlanGuideInput = {
  title: string;
  contentMarkdown: string | null;
};

export type AiPlanInput = {
  gameName: string;
  platform: string;
  trophies: AiPlanTrophyInput[];
  guides: AiPlanGuideInput[];
};

export const AI_PLAN_SYSTEM_PROMPT = `Sos un asistente experto en platinar juegos de PlayStation. Analizás la lista de trofeos de un juego y devolvés un plan de desbloqueo en español.

Reglas:
- Respondé ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes o después, sin markdown ni bloques de código.
- El JSON debe tener exactamente esta forma:
{
  "resumen": "string breve",
  "puede_platinar_en_una_run": boolean,
  "notas_run_unica": "string",
  "grupos_de_partidas": [{ "run": number, "objetivo": "string", "trofeos_relacionados": ["<trofeo_id>", "..."] }],
  "missables": [{ "trofeo_id": "<trofeo_id>", "motivo": "string", "momento_limite": "string" }],
  "orden_sugerido": ["<trofeo_id>", "..."],
  "tips_generales": ["string", "..."],
  "modos": [{ "modo": "string", "trofeos_relacionados": ["<trofeo_id>", "..."] }]
}
- Los valores de "trofeo_id" deben ser exactamente los "id" que te paso en la lista de trofeos, nunca nombres inventados.
- Si el juego se puede platinar en una sola partida, "grupos_de_partidas" puede quedar vacío y "puede_platinar_en_una_run" en true.
- Si hay guías propias cargadas para el juego, tenelas en cuenta y no las contradigas.
- No inventes trofeos que no estén en la lista.
- Cada trofeo trae "ya_obtenido": el usuario ya lo tiene desbloqueado. NO incluyas trofeos con "ya_obtenido": true en "orden_sugerido" ni en "missables" (ya no aplica, es pasado). Si "ya_obtenido" es true para todos los trofeos de un grupo de partidas, no incluyas ese grupo. Enfocá todo el plan únicamente en los trofeos pendientes ("ya_obtenido": false).
- Prestá especial atención a trofeos "missable" (perdibles): los que solo se pueden conseguir en una misión/capítulo/decisión específica y quedan inaccesibles después (por un punto de no retorno, una elección que excluye otra, un evento que ocurre una sola vez en toda la partida, o contenido de una sola visita). Inferí esto de la descripción de cada trofeo, aunque no lo diga explícitamente con la palabra "missable".
- Para CADA trofeo perdible que detectes, agregalo a "missables" con "motivo" explicando por qué es perdible y "momento_limite" indicando el momento exacto (capítulo, misión o decisión) antes del cual hay que conseguirlo. Si no estás seguro de que un trofeo sea perdible, no lo incluyas ahí.
- Si detectás algún missable, mencionalo también en "notas_run_unica" o en el "objetivo" del grupo de partidas correspondiente, para que quede visible sin tener que leer toda la lista de missables.
- Agrupá los trofeos pendientes por modo de juego en "modos" cuando el juego tenga más de un modo relevante para trofeos (ej.: "Modo historia" / "Campaña" vs "Modo online" vs modos especiales propios del juego, como "Modo Mercenarios" en Resident Evil, "Modo horda", "Multijugador competitivo", DLC, etc.). Inferilo de los nombres/descripciones de los trofeos (menciones a "online", "multiplayer", "co-op", el nombre de un modo especial, etc.).
- Cada entrada de "modos" agrupa los "trofeos_relacionados" (ids) de ESE modo específico. Un trofeo puede aparecer en un solo modo. Si todos los trofeos pendientes son de un único modo (ej. solo campaña), dejá "modos" vacío: no tiene sentido separar si no hay nada que separar.`;

const MAX_TROPHY_DESCRIPTION_CHARS = 110;
const MAX_GUIDE_CHARS = 500;

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/**
 * Arma el prompt de usuario con los datos del juego, trofeos y guías propias
 * existentes. Trunca descripciones largas: con juegos de 70-80+ trofeos
 * (ej. The Witcher 3), el texto completo de cada descripción hace que el
 * prompt supere el límite de tokens por minuto del free tier de Groq (8000
 * TPM) y el proveedor devuelve 413. El filtro de trofeos de DLC en
 * ai-actions.ts ayuda, pero sólo tiene efecto en juegos re-sincronizados
 * después de agregarse `trophy_group_id` -- esta truncación es la defensa
 * que funciona siempre, sin depender de un re-sync.
 */
export function buildAiPlanUserPrompt(input: AiPlanInput): string {
  const trophyLines = input.trophies.map((t) =>
    JSON.stringify({
      id: t.id,
      nombre: t.name,
      descripcion: truncate(t.description ?? "", MAX_TROPHY_DESCRIPTION_CHARS),
      tipo: t.type,
      oculto: t.hidden,
      ya_obtenido: t.obtained,
    }),
  );

  const guideLines = input.guides.map(
    (g) => `### ${g.title}\n${truncate(g.contentMarkdown ?? "", MAX_GUIDE_CHARS)}`,
  );

  return [
    `Juego: ${input.gameName} (${input.platform})`,
    "",
    "Trofeos (uno por línea, JSON):",
    ...trophyLines,
    "",
    guideLines.length > 0 ? "Guías propias ya cargadas para este juego:" : "No hay guías propias cargadas para este juego.",
    ...guideLines,
  ].join("\n");
}

export type TrophyHintInput = {
  gameName: string;
  platform: string;
  trophyName: string;
  trophyDescription: string | null;
  trophyType: "bronze" | "silver" | "gold" | "platinum";
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
