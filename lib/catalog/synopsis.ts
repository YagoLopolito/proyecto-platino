/**
 * Sinopsis corta de un juego a partir de su descripción (RAWG o IA).
 *
 * RAWG trae a veces descripciones enormes -- varios párrafos con la historia,
 * las mecánicas, los modos de juego y hasta las ediciones --, y en la ficha
 * tiene que ir una sinopsis de un par de oraciones. Se recorta al mostrar y no
 * al guardar, así también se arreglan las descripciones que ya están en caché.
 *
 * Puro, sin `server-only`: se testea desde el spec.
 */

/** Largo objetivo de la sinopsis, en caracteres. */
export const SYNOPSIS_MAX_CHARS = 280;

/**
 * Primer párrafo, cortado en la última oración completa que entra en
 * `maxChars`. Si la primera oración sola ya se pasa, se corta en la última
 * palabra con "…". Devuelve `null` si no queda texto.
 */
export function toSynopsis(
  description: string | null | undefined,
  maxChars = SYNOPSIS_MAX_CHARS,
): string | null {
  const text = description?.trim();
  if (!text) return null;

  const firstParagraph = (text.split(/\n\s*\n|\n/).find((part) => part.trim() !== "") ?? text)
    .replace(/\s+/g, " ")
    .trim();
  if (firstParagraph.length <= maxChars) return firstParagraph;

  // Oraciones: termina en . ! ? (o …) seguido de espacio.
  const sentences = firstParagraph.match(/[^.!?…]+(?:[.!?…]+|$)(?:\s+|$)/g) ?? [firstParagraph];
  let synopsis = "";
  for (const sentence of sentences) {
    if ((synopsis + sentence).trim().length > maxChars) break;
    synopsis += sentence;
  }
  synopsis = synopsis.trim();
  if (synopsis !== "") return synopsis;

  const cut = firstParagraph.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, "")}…`;
}
