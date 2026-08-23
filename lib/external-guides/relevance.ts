/**
 * Heurística para quedarnos SOLO con guías de trofeos/logros y descartar el
 * resto del contenido que devuelve una búsqueda genérica por juego (builds,
 * mods, tips de rendimiento, listas de armas, etc.). Sin I/O ni "server-only"
 * a propósito: es lógica pura, reusable desde donde haga falta.
 */

/** Palabras/frases que marcan una guía de trofeos/logros/100%, en ES y EN. */
const GUIDE_KEYWORDS = [
  "trophy",
  "trophies",
  "platinum",
  "achievement",
  "achievements",
  "trofeo",
  "trofeos",
  "platino",
  "logro",
  "logros",
  "100%",
  "completionist",
  "all collectibles",
  "walkthrough",
];

/**
 * Palabras que descartan el resultado aunque mencione alguna de las de arriba
 * (ej. "trophy room mod" es un mod, no una guía; "achievement trainer" es un
 * cheat). Se evalúan con límite de palabra para que "mod" no matchee "mode".
 */
const NEGATIVE_KEYWORDS = ["mod", "mods", "modding", "cheat", "cheats", "trainer", "benchmark"];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matchea la palabra/frase completa, no como subcadena: si no, "logro"
 * matchearía "logrometro" y "mod" matchearía "mode"/"model". `\b` no sirve
 * para "100%" (el `%` ya es un límite), así que se usan lookarounds sobre
 * caracteres de palabra.
 */
function containsTerm(haystack: string, term: string): boolean {
  return new RegExp(`(?<![\\w])${escapeRegExp(term)}(?![\\w])`, "u").test(haystack);
}

/**
 * true si el título (más los tags que traiga la fuente) pintan a guía de
 * trofeos/logros. Se usa para filtrar los resultados de Steam Community,
 * donde la búsqueda por juego devuelve guías de cualquier tema.
 */
export function looksLikeAchievementGuide(title: string, tags: string[] = []): boolean {
  const haystack = normalize([title, ...tags].join(" "));

  if (NEGATIVE_KEYWORDS.some((term) => containsTerm(haystack, term))) return false;

  return GUIDE_KEYWORDS.some((term) => containsTerm(haystack, normalize(term)));
}
