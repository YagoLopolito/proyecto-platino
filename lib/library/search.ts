/**
 * Búsqueda por nombre de la biblioteca.
 *
 * Módulo **puro y sin `server-only`** a propósito: corre en el cliente (el
 * filtro de `/juegos` es client-side sobre la biblioteca ya cargada) y se
 * testea directo desde el spec, igual que `steam-relevance` y
 * `screenshot-import`.
 *
 * Por qué no reusa `normalizeName` de `lib/catalog/`: ese normalizador está
 * hecho para *comparar* nombres entre fuentes, así que borra los tokens de
 * edición ("remastered", "definitive edition") y no toca los acentos, que ahí
 * caen como separadores. Para buscar, las dos cosas están mal: quien escribe
 * "remastered" quiere justamente los remasters, y quien escribe "pokemon"
 * espera encontrar "Pokémon" -- nadie pone acentos en un buscador, menos en el
 * teclado de un celular.
 */

/** Minúsculas, sin acentos y sin puntuación: "Pokémon™: Edición" → "pokemon edicion". */
export function searchKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    // Bloque "Combining Diacritical Marks": lo que NFD separó de cada letra.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * ¿El nombre matchea lo tipeado? Todas las palabras del query tienen que estar
 * en el nombre, en cualquier orden y como prefijo de palabra o subcadena: así
 * "last us" encuentra "The Last of Us" y "re4" no encuentra nada raro.
 *
 * Un query vacío matchea todo (no filtrar es el estado por defecto).
 */
export function matchesSearch(name: string, query: string): boolean {
  const needle = searchKey(query);
  if (needle === "") return true;
  const haystack = searchKey(name);
  return needle.split(" ").every((word) => haystack.includes(word));
}
