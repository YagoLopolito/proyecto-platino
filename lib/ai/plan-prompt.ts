/**
 * Prompt del plan de trofeos. Vive en su propio módulo SIN `import
 * "server-only"` (misma razón que `lib/psn/playtime-pages.ts`): es armado de
 * strings, no toca red, base ni secretos, y el presupuesto de tamaño es
 * justamente lo que hay que poder testear. `prompt.ts` lo re-exporta para no
 * cambiarle los imports a nadie.
 */
export type AiPlanTrophyInput = {
  id: string;
  name: string;
  description: string | null;
  // `achievement` es el tipo plano de Steam: el prompt lo pasa tal cual y el
  // modelo no tiene que inventarle un color de trofeo que no existe.
  type: "bronze" | "silver" | "gold" | "platinum" | "achievement";
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
  "desafios_de_dificultad": [{ "trofeo_id": "<trofeo_id>", "categoria": "dificultad_maxima" | "speedrun" | "sin_morir" | "permadeath" | "sin_recursos" | "otro_desafio", "motivo": "string", "consejo": "string" }],
  "acumulables": [{ "trofeo_id": "<trofeo_id>", "categoria": "bajas_con_condicion" | "coleccionables" | "acciones_repetidas" | "recursos" | "progresion_larga", "objetivo": "string", "consejo": "string", "se_puede_farmear": boolean | null }],
  "orden_sugerido": ["<trofeo_id>", "..."],
  "siguiente_trofeo": { "trofeo_id": "<trofeo_id>", "por_que": "string", "pasos": ["string", "..."] },
  "tips_generales": ["string", "..."],
  "modos": [{ "modo": "string", "trofeos_relacionados": ["<trofeo_id>", "..."] }]
}
- Los valores de "trofeo_id" deben ser exactamente los "id" que te paso en la lista de trofeos, nunca nombres inventados.
- "siguiente_trofeo" es EL trofeo que el usuario tiene que encarar ahora: el primero de "orden_sugerido". En "por_que" explicá en una oración por qué va primero (es el más rápido, habilita otros, es perdible y se acerca el punto de no retorno, etc.) y en "pasos" poné de 2 a 5 pasos concretos y accionables para desbloquearlo (dónde, cuándo y cómo). Si no queda ningún trofeo pendiente, poné "siguiente_trofeo": null.
- Si el juego se puede platinar en una sola partida, "grupos_de_partidas" puede quedar vacío y "puede_platinar_en_una_run" en true.
- Si hay guías propias cargadas para el juego, tenelas en cuenta y no las contradigas.
- No inventes trofeos que no estén en la lista.
- La lista que te paso trae ÚNICAMENTE los trofeos PENDIENTES: los que el usuario ya desbloqueó no están, sólo te digo cuántos son. Todo el plan es sobre los pendientes; no menciones ni inventes trofeos que no estén en la lista.
- Prestá especial atención a trofeos "missable" (perdibles): los que solo se pueden conseguir en una misión/capítulo/decisión específica y quedan inaccesibles después (por un punto de no retorno, una elección que excluye otra, un evento que ocurre una sola vez en toda la partida, o contenido de una sola visita). Inferí esto de la descripción de cada trofeo, aunque no lo diga explícitamente con la palabra "missable".
- Para CADA trofeo perdible que detectes, agregalo a "missables" con "motivo" explicando por qué es perdible y "momento_limite" indicando el momento exacto (capítulo, misión o decisión) antes del cual hay que conseguirlo. Si no estás seguro de que un trofeo sea perdible, no lo incluyas ahí.
- NUNCA pongas en "missables" un trofeo de HISTORIA: los que salen solos al avanzar la campaña (terminar un capítulo o misión principal, derrotar a un jefe obligatorio, ver el final). No se pueden perder porque el juego obliga a pasar por ahí; si el usuario no los tiene es porque no llegó. "Completá el capítulo X", "Terminá la misión Y", "Derrotá a Z" son de historia salvo que la descripción pida una condición extra (una decisión que excluye otra, hacerlo de cierta forma, tener un objeto).
- Tampoco son perdibles los que siguen disponibles siempre: coleccionables de mundo abierto, enemigos que reaparecen, actividades repetibles o cualquier cosa completable después del final. Si piden una cantidad, van a "acumulables", no a "missables".
- Un trofeo va a "missables" SÓLO si podés nombrar el punto de no retorno o el evento único que lo bloquea. Si el "momento_limite" te sale vago ("durante la historia", "antes del final"), dejalo afuera: mejor "missables" vacío que lleno de trofeos de historia.
- Si detectás algún missable, mencionalo también en "notas_run_unica" o en el "objetivo" del grupo de partidas correspondiente, para que quede visible sin tener que leer toda la lista de missables.
- Detectá los trofeos de DIFICULTAD / DESAFÍO y ponelos en "desafios_de_dificultad": los que exigen terminar el juego (o una parte) en la dificultad más alta ("dificultad_maxima": hardcore, sobreviviente, professional, ultra violence, etc.), completarlo en un tiempo límite o a contrarreloj ("speedrun"), no morir ni recibir daño ("sin_morir"), un modo con muerte permanente o una sola vida ("permadeath"), o hacerlo con recursos/armas/objetos restringidos ("sin_recursos"). Cualquier otro desafío de habilidad exigente va como "otro_desafio".
- Inferí esto del nombre y la descripción del trofeo aunque no use esas palabras exactas; si no estás seguro, no lo incluyas. En "motivo" explicá qué exige el trofeo y en "consejo" cómo encararlo (ej.: si conviene arrancar directo en la dificultad más alta para no tener que rejugar, si la dificultad es acumulativa con las menores, si conviene dejarlo para el final).
- Si algún desafío de dificultad obliga a jugar de una forma desde el principio (típicamente arrancar en la dificultad máxima), decilo también en "notas_run_unica" o en el "objetivo" del grupo de partidas, para que se vea antes de empezar.
- Detectá los trofeos de ACUMULACIÓN y ponelos en "acumulables": los que piden juntar una CANTIDAD de algo a lo largo de la partida. Son los que arruinan una run no por difíciles sino por desatención: si el usuario no sabe que existen, llega al final de la historia con el contador a la mitad. Categorías: matar/derrotar N enemigos de una forma específica (con un arma concreta, por headshot, con sigilo, tirándolos al vacío, con el entorno) va como "bajas_con_condicion"; juntar N objetos, documentos, cofres o secretos repartidos por el mundo va como "coleccionables"; repetir N veces una acción o maniobra (asistencias con el compañero, contraataques, ejecuciones, viajes, fotos) va como "acciones_repetidas"; acumular N de una moneda, material o mejora va como "recursos"; llegar a un nivel/rango alto o sumar muchas horas va como "progresion_larga".
- En "objetivo" poné la cantidad y qué hay que acumular, corto y concreto (ej.: "40 enemigos con el bláster", "10 bajas por headshot", "5 enemigos arrojados al vacío", "5 asistencias con tu compañero"). En "consejo" decí cómo ir sumándolo sin desviarse de la historia (con qué arma jugar por defecto, en qué zona conviene, si hay un capítulo con enemigos de sobra para completarlo).
- "se_puede_farmear" es true si el contador se puede completar después de terminar la historia (mundo abierto, selección de capítulos, enemigos que reaparecen), false si al terminar el juego ya no hay forma de seguir sumando y hay que rejugar. Si no estás seguro, poné null en vez de adivinar.
- Un trofeo de acumulación con "se_puede_farmear": false es de los más importantes del plan: mencionalo también en "notas_run_unica" o en el "objetivo" del grupo de partidas, para que se sepa desde el principio y no al final.
- Un mismo trofeo puede estar en "acumulables" y además en "missables" o en "desafios_de_dificultad" si corresponde: son cosas distintas y no se excluyen.
- Agrupá los trofeos pendientes por modo de juego en "modos" cuando el juego tenga más de un modo relevante para trofeos (ej.: "Modo historia" / "Campaña" vs "Modo online" vs modos especiales propios del juego, como "Modo Mercenarios" en Resident Evil, "Modo horda", "Multijugador competitivo", DLC, etc.). Inferilo de los nombres/descripciones de los trofeos (menciones a "online", "multiplayer", "co-op", el nombre de un modo especial, etc.).
- Cada entrada de "modos" agrupa los "trofeos_relacionados" (ids) de ESE modo específico. Un trofeo puede aparecer en un solo modo. Si todos los trofeos pendientes son de un único modo (ej. solo campaña), dejá "modos" vacío: no tiene sentido separar si no hay nada que separar.`;

const MAX_GUIDE_CHARS = 500;

/**
 * Letra por tipo de trofeo, para no repetir "bronze"/"silver" cincuenta veces.
 * "A" es el `achievement` plano de Steam, que no tiene color.
 */
const TYPE_LETTERS: Record<AiPlanTrophyInput["type"], string> = {
  bronze: "B",
  silver: "S",
  gold: "O",
  platinum: "P",
  achievement: "A",
};

/**
 * Presupuesto de entrada, en tokens. El free tier de Groq permite 8000 tokens
 * por minuto contando prompt + respuesta, y `max_tokens` de la respuesta es
 * 2800: pasarse devuelve 413 `rate_limit_exceeded`, que es lo que veía el
 * usuario en juegos de 50+ trofeos. Se deja margen para la variación del
 * tokenizador y para el prompt de reintento.
 */
export const INPUT_TOKEN_BUDGET = 4400;

/**
 * El tokenizador no está disponible del lado nuestro, así que se estima por
 * caracteres. 3.5 es conservador para español con nombres propios: subestimar
 * los tokens es lo único que rompe, así que el divisor va bajo a propósito.
 */
const CHARS_PER_TOKEN = 3.5;

/**
 * Cuánto se deja de cada descripción. Se prueba de mayor a menor hasta que el
 * prompt entra en el presupuesto: los juegos chicos conservan el texto
 * completo y sólo los grandes lo pierden, en vez de recortarle a todos por
 * culpa de los pocos que no entran.
 */
const DESCRIPTION_STEPS = [110, 70, 45, 25, 0];

function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function renderPrompt(input: AiPlanInput, descriptionChars: number): string {
  const pending = input.trophies.filter((t) => !t.obtained);
  const obtained = input.trophies.length - pending.length;

  // Formato de columnas en vez de un JSON por trofeo: las comillas y los
  // nombres de campo repetidos costaban ~18 tokens POR TROFEO sin aportar
  // nada, y con 50+ trofeos eso solo alcanzaba para pasarse del límite.
  const trophyLines = pending.map((t) => {
    const description = truncate(t.description ?? "", descriptionChars);
    return [
      t.id,
      TYPE_LETTERS[t.type],
      `${t.name}${t.hidden ? " [oculto]" : ""}`,
      description,
    ].join("|");
  });

  const guideLines = input.guides.map(
    (g) => `### ${g.title}\n${truncate(g.contentMarkdown ?? "", MAX_GUIDE_CHARS)}`,
  );

  return [
    `Juego: ${input.gameName} (${input.platform})`,
    obtained > 0
      ? `El usuario ya desbloqueó ${obtained} de ${input.trophies.length} trofeos; abajo van sólo los ${pending.length} pendientes.`
      : `El usuario no desbloqueó ningún trofeo todavía: los ${pending.length} están pendientes.`,
    "",
    "Trofeos pendientes, uno por línea, campos separados por | :",
    "id|tipo|nombre|descripción   (tipo: B bronce, S plata, O oro, P platino, A logro sin tipo)",
    ...trophyLines,
    "",
    guideLines.length > 0
      ? "Guías propias ya cargadas para este juego:"
      : "No hay guías propias cargadas para este juego.",
    ...guideLines,
  ].join("\n");
}

/**
 * Arma el prompt de usuario con los datos del juego, trofeos pendientes y
 * guías propias existentes, recortando lo necesario para entrar en
 * `INPUT_TOKEN_BUDGET`.
 *
 * Con juegos de 50+ trofeos el prompt se pasaba del límite por minuto del free
 * tier de Groq y el proveedor devolvía 413: el usuario veía "no se pudo generar
 * el plan" en los juegos más grandes, que son justo donde un plan sirve más.
 * El filtro de trofeos de DLC en ai-actions.ts ayuda, pero sólo tiene efecto en
 * juegos re-sincronizados después de agregarse `trophy_group_id`; esto funciona
 * siempre, sin depender de un re-sync.
 */
export function buildAiPlanUserPrompt(input: AiPlanInput): string {
  const systemTokens = estimateTokens(AI_PLAN_SYSTEM_PROMPT);

  let prompt = renderPrompt(input, DESCRIPTION_STEPS[0]);
  for (const chars of DESCRIPTION_STEPS) {
    prompt = renderPrompt(input, chars);
    if (systemTokens + estimateTokens(prompt) <= INPUT_TOKEN_BUDGET) return prompt;
  }

  // Ni sin descripciones entra: quedan los nombres, que es el mínimo con el
  // que el plan sigue teniendo sentido. Se avisa porque significa que este
  // juego va a pedirle al modelo más de lo que el free tier permite.
  console.warn(
    `[ai] el prompt de "${input.gameName}" no entra en el presupuesto ` +
      `(${systemTokens + estimateTokens(prompt)} tokens estimados sobre ${INPUT_TOKEN_BUDGET}).`,
  );
  return prompt;
}
