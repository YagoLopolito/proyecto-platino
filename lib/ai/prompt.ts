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
  "tips_generales": ["string", "..."]
}
- Los valores de "trofeo_id" deben ser exactamente los "id" que te paso en la lista de trofeos, nunca nombres inventados.
- Si el juego se puede platinar en una sola partida, "grupos_de_partidas" puede quedar vacío y "puede_platinar_en_una_run" en true.
- Si hay guías propias cargadas para el juego, tenelas en cuenta y no las contradigas.
- No inventes trofeos que no estén en la lista.`;

/** Arma el prompt de usuario con los datos del juego, trofeos y guías propias existentes. */
export function buildAiPlanUserPrompt(input: AiPlanInput): string {
  const trophyLines = input.trophies.map((t) =>
    JSON.stringify({
      id: t.id,
      nombre: t.name,
      descripcion: t.description ?? "",
      tipo: t.type,
      oculto: t.hidden,
      ya_obtenido: t.obtained,
    }),
  );

  const guideLines = input.guides.map((g) => `### ${g.title}\n${g.contentMarkdown ?? ""}`);

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
