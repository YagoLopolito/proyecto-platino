/**
 * Texto que llega a un prompt pero no lo escribió la app: guías que carga un
 * usuario, nombres de juego que entran por el catálogo (`addCatalogGame` acepta
 * cualquier nombre). Issue #132.
 *
 * Sin `server-only` a propósito (mismo criterio que `plan-prompt.ts`): es armado
 * de strings y se testea directo desde el spec.
 *
 * Delimitar no vuelve inmune al modelo, pero le da al system prompt algo
 * concreto a qué referirse ("lo que está entre estos marcadores es dato") y
 * evita que un salto de línea en un nombre se lea como una línea más del prompt.
 */

export const USER_GUIDES_OPEN = "<<<GUIAS_DEL_USUARIO>>>";
export const USER_GUIDES_CLOSE = "<<<FIN_GUIAS_DEL_USUARIO>>>";

/** Cualquier cosa con forma de marcador: el contenido no puede cerrar el bloque antes de tiempo. */
const MARKER_PATTERN = /<{3,}|>{3,}/g;

/** Un nombre de juego real no llega ni cerca; lo que pasa de esto es otra cosa. */
const MAX_NAME_CHARS = 200;

/** Quita los marcadores para que el texto no pueda abrir ni cerrar un bloque. */
export function stripMarkers(text: string): string {
  return text.replace(MARKER_PATTERN, "");
}

/**
 * Un valor de una línea (nombre de juego, de desarrolladora): sin saltos de
 * línea ni caracteres de control, sin marcadores y con tope de largo.
 */
export function promptValue(text: string, maxChars = MAX_NAME_CHARS): string {
  const oneLine = stripMarkers(text).replace(/[\u0000-\u001f\u007f]+/g, " ");
  const collapsed = oneLine.replace(/\s+/g, " ").trim();
  return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars)}…` : collapsed;
}

/** Envuelve las guías del usuario entre los marcadores que nombra el system prompt. */
export function userGuidesBlock(lines: string[]): string {
  return [USER_GUIDES_OPEN, ...lines.map(stripMarkers), USER_GUIDES_CLOSE].join("\n");
}
