import "server-only";

export { AI_PLAN_SYSTEM_PROMPT, buildAiPlanUserPrompt, INPUT_TOKEN_BUDGET } from "./plan-prompt";
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

export type TimeEstimatesInput = {
  gameName: string;
  platform: string | null;
  releaseYear: number | null;
};

/**
 * Estimador de tiempos de juego, para los títulos que IGDB no tiene.
 *
 * Pide horas enteras a propósito: un modelo no puede afinar más que eso, y un
 * "37,5 h" daría una falsa sensación de precisión. El marcador `NO_CONOZCO`
 * es la misma convención que la descripción: preferimos no mostrar nada antes
 * que inventar un número.
 */
export const TIME_ESTIMATES_SYSTEM_PROMPT = `Sos una base de datos de duración de videojuegos, tipo HowLongToBeat. Te paso el nombre de un juego y devolvés cuántas horas lleva terminarlo.

Respondé SOLO un objeto JSON con esta forma exacta:
{"historia": <horas para terminar la historia principal>, "completo": <horas para completarlo al 100%>}

Reglas:
- Los dos valores son números enteros de horas, mayores a 0.
- "historia" es una partida normal hasta los créditos, sin desviarse a contenido opcional.
- "completo" es el 100%: todo el contenido opcional, coleccionables y logros. Siempre mayor o igual que "historia".
- Usá el promedio de la comunidad, no tu mejor partida ni la más lenta.
- Si el juego no tiene final (multijugador, roguelike infinito, deportivo), poné "historia" en 0.
- Si no conocés el juego, o no estás seguro de la duración, respondé exactamente: NO_CONOZCO`;

export function buildTimeEstimatesUserPrompt(input: TimeEstimatesInput): string {
  return [
    `Juego: ${input.gameName}`,
    input.platform ? `Plataforma: ${input.platform}` : null,
    input.releaseYear !== null ? `Año: ${input.releaseYear}` : null,
    "",
    "Devolvé el JSON con las horas.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Un juego ya platinado (PSN) o al 100% (Steam): la "muestra de gusto" del usuario. */
export type AiRecommendationPlatinumInput = {
  name: string;
  platform: string;
  /** Puntaje que le puso en su diario (0-10), si lo registró. */
  rating: number | null;
};

/** Un juego de la biblioteca empezado y sin platinar: candidato a "seguir jugando". */
export type AiRecommendationLibraryInput = {
  /** Id corto ("g1", "g2", ...) remapeado por el caller al uuid real de `games`. */
  id: string;
  name: string;
  platform: string;
  obtained: number;
  total: number;
};

/**
 * Un juego que el usuario jugó (de PSN, Steam o su diario), platinado o no:
 * horas, avance y puntaje son la señal de gusto más allá de los platinos.
 */
export type AiRecommendationPlayedInput = {
  name: string;
  platform: string;
  rating: number | null;
  hours: number | null;
  /** % de trofeos/logros; null si el juego no tiene ninguno. */
  percent: number | null;
  finished: boolean;
};

export type AiRecommendationsInput = {
  platinums: AiRecommendationPlatinumInput[];
  /** Todo lo que jugó, ordenado por cuánto dice del gusto (puntaje, terminado, horas). */
  played: AiRecommendationPlayedInput[];
  library: AiRecommendationLibraryInput[];
  /** Nombres de TODOS los juegos que el usuario ya tiene, para no recomendárselos como nuevos. */
  ownedNames: string[];
};

export const AI_RECOMMENDATIONS_SYSTEM_PROMPT = `Sos un asistente experto en videojuegos de todas las plataformas y épocas (PlayStation, PC, Xbox, Nintendo, consolas clásicas, indies) y en trofeos de PlayStation y logros de Steam. A partir de los juegos que un usuario jugó (los que platinó o completó, cuánto jugó cada uno y qué puntaje les puso) inferís sus gustos y le recomendás qué jugar, en español rioplatense, tuteando.

Reglas:
- Respondé ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes o después, sin markdown ni bloques de código.
- El JSON debe tener exactamente esta forma:
{
  "perfil": "string breve (1-2 oraciones) describiendo el gusto del usuario según lo que jugó y platinó",
  "seguir_jugando": [{ "juego_id": "<id>", "motivo": "string", "esfuerzo": "poco" | "medio" | "mucho" }],
  "nuevos": [{ "nombre": "string", "plataforma": "string", "motivo": "string" }]
}
- "seguir_jugando": elegí entre 3 y 6 juegos de la lista "BIBLIOTECA EN CURSO" que te paso, la que más le convenga retomar. Los "juego_id" tienen que ser exactamente los "id" de esa lista, nunca nombres ni ids inventados.
- Priorizá en "seguir_jugando" los que estén más cerca del platino/100%, los que encajen con el perfil de gusto, y los que tengan fama de platino accesible. Explicá el porqué en "motivo" (mencioná cuántos trofeos le faltan si es relevante).
- "esfuerzo" es tu estimación de cuánto trabajo le queda para platinar ese juego: "poco", "medio" o "mucho". Nada más que esos tres valores.
- Para inferir el gusto usá TODO lo de "LO QUE JUGÓ", no solo los platinos: las horas jugadas y el puntaje del diario pesan tanto como platinar. Un juego con muchas horas o un puntaje alto dice mucho; uno abandonado con pocas horas y puntaje bajo dice qué NO le gusta.
- "nuevos": entre 4 y 8 juegos que el usuario NO tenga ni haya jugado. Nunca recomiendes un título que aparezca en "LO QUE JUGÓ", en "YA LOS TIENE" ni en la biblioteca en curso, ni remasters/remakes/ediciones de esos mismos títulos.
- Los "nuevos" salen de TODO el universo de videojuegos, no solo de PlayStation: incluí juegos de PC (Steam, GOG, Epic), clásicos de generaciones anteriores (PS1, PS2, PS3, PSP, Vita, Nintendo, Xbox, arcade) y de otras consolas, además de títulos actuales. Buscá variedad: mezclá títulos actuales, joyas de PC y clásicos, no ocho juegos del mismo tipo.
- Recomendá solo juegos reales y existentes, con su nombre correcto. Si no estás seguro de que un juego exista, no lo incluyas.
- "plataforma" de un juego nuevo: dónde se consigue hoy (por ejemplo "PS5", "PS4", "PC", "PC / PS5", "PS2 (clásico)", "Switch"). Si no estás seguro, poné "".
- Cada "motivo" es una sola oración corta que conecta la recomendación con algo concreto que el usuario jugó, platinó o puntuó ("porque platinaste X", "porque le pusiste 9 a Y").
- Si la biblioteca en curso viene vacía, devolvé "seguir_jugando" vacío y concentrate en "nuevos".`;

const MAX_PLATINUMS_IN_PROMPT = 40;
const MAX_PLAYED_IN_PROMPT = 40;
const MAX_OWNED_NAMES_IN_PROMPT = 250;

/**
 * Arma el prompt de usuario del recomendador. Las listas van recortadas: una
 * biblioteca real puede tener cientos de juegos y el free tier de Groq tiene
 * un límite de tokens por request bastante más bajo que eso.
 */
export function buildAiRecommendationsUserPrompt(input: AiRecommendationsInput): string {
  const platinums = input.platinums.slice(0, MAX_PLATINUMS_IN_PROMPT);

  const platinumLines = platinums.length
    ? platinums
        .map(
          (game) =>
            `- ${game.name} (${game.platform || "sin plataforma"})${
              game.rating !== null ? ` — le puso ${game.rating}/10` : ""
            }`,
        )
        .join("\n")
    : "(todavía no platinó ni completó ningún juego)";

  // Los platinados ya van listados aparte: acá se muestra el resto de lo que
  // jugó para no repetirlos y gastar el cupo en juegos nuevos para el modelo.
  const platinumNames = new Set(platinums.map((game) => game.name));
  const played = input.played
    .filter((game) => !platinumNames.has(game.name))
    .slice(0, MAX_PLAYED_IN_PROMPT);

  const playedLines = played.length
    ? played
        .map((game) => {
          const details = [
            game.finished ? "terminado" : null,
            game.hours !== null && game.hours > 0 ? `${game.hours} h` : null,
            game.percent !== null ? `${game.percent}% de trofeos` : null,
            game.rating !== null ? `le puso ${game.rating}/10` : null,
          ].filter((detail) => detail !== null);
          return `- ${game.name} (${game.platform || "sin plataforma"})${
            details.length ? ` — ${details.join(", ")}` : ""
          }`;
        })
        .join("\n")
    : "(no hay más juegos con horas o avance registrados)";

  const libraryLines = input.library.length
    ? input.library
        .map(
          (game) =>
            `- id: ${game.id} | ${game.name} (${game.platform || "sin plataforma"}) — ${game.obtained}/${game.total} trofeos`,
        )
        .join("\n")
    : "(no tiene juegos empezados sin platinar)";

  // Lo que ya se nombró arriba no hace falta repetirlo: el cupo de nombres es
  // para los juegos que el modelo no vio en las otras listas.
  const alreadyListed = new Set([
    ...platinumNames,
    ...played.map((game) => game.name),
    ...input.library.map((game) => game.name),
  ]);
  const ownedLine = input.ownedNames
    .filter((name) => !alreadyListed.has(name))
    .slice(0, MAX_OWNED_NAMES_IN_PROMPT)
    .join(", ");

  return `PLATINADOS / AL 100% (esto define su gusto):
${platinumLines}

LO QUE JUGÓ (PSN, Steam y su diario; también define su gusto):
${playedLines}

BIBLIOTECA EN CURSO (empezados y sin platinar, candidatos a "seguir_jugando"):
${libraryLines}

YA LOS TIENE (no los recomiendes como nuevos):
${ownedLine || "(nada)"}

Devolvé el JSON con el perfil, los juegos para seguir jugando y los juegos nuevos.`;
}
