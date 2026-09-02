/**
 * Filtro y ranking de guías de Steam Community por relevancia para trofeos.
 * Vive en su propio módulo SIN `import "server-only"` (misma razón que
 * `lib/ai/plan-prompt.ts`): es texto puro, no toca red ni secretos, y es
 * justamente lo que hay que poder testear sin salir a internet.
 *
 * El problema que resuelve: `QueryFiles` ordenado por votos devuelve lo más
 * votado del juego, que en la mayoría de los títulos son traducciones no
 * oficiales, mods y curiosidades ("cómo romper el juego en un turno"). Nada de
 * eso sirve para platinar.
 */

/** Etiquetas oficiales de guía de Steam que sí sirven para completar un juego. */
export const RELEVANT_STEAM_TAGS = [
  "Achievements",
  "Walkthroughs",
  "Secrets",
  "Loot",
  "Classes",
  "Characters",
] as const;

/**
 * Palabras que marcan una guía como útil para platinar / hacer el 100%.
 * Se buscan en el título, en varios idiomas porque las guías de Steam no
 * vienen normalizadas.
 */
const RELEVANT_TITLE_PATTERNS: RegExp[] = [
  /\b(achievement|achievements|logros?|trophy|trophies|trofeos?)\b/i,
  /\b100\s*%|\bfull\s+completion\b|\bcompletionist\b/i,
  /\b(walkthrough|guide|guía|guia|tutorial)\b/i,
  /\b(build|builds|loadout|loadouts|spec|specs)\b/i,
  /\b(collectible|collectibles|coleccionables|secrets?|secretos?)\b/i,
  /\b(all\s+endings?|todos\s+los\s+finales)\b/i,
  /\b(beginner|starter|tips?|strategy|estrategia)\b/i,
];

/**
 * Palabras que descartan una guía aunque venga bien puntuada: traducciones,
 * localizaciones y mods. Son el grueso del ruido en juegos nuevos.
 */
const NOISE_TITLE_PATTERNS: RegExp[] = [
  /\b(translation|localization|localisation|traducci[oó]n|tradu[cç][aã]o|preklad|p[rř]eklad|t[lł]umaczenie|traduzione|[üu]bersetzung)\b/i,
  // Cirílico/CJK: "русификатор", "русский текст", "перевод", 汉化/翻译, 한글 패치.
  /rusifikator|русифика|русск|перевод|翻[译譯]|汉化|한글/i,
  /\b(mod|mods|modding|cheat\s*engine|trainer|save\s*file|savegame)\b/i,
  /\b(fps|performance|lag|crash|fix|fixes|optimi[sz]ation|optimizaci[oó]n)\b/i,
];

/**
 * Guías escritas en un idioma que no es español ni inglés. Steam no expone un
 * filtro de idioma usable en `QueryFiles`, así que se detecta por el título,
 * que es lo único que devuelve la API antes de abrir la guía.
 *
 * Dos señales, en orden de confianza:
 *
 * 1. **Escritura no latina** (cirílico, griego, hebreo, árabe, tailandés, CJK,
 *    hangul): un título en ruso o en chino nunca es una guía en español ni en
 *    inglés. Es una regla dura, sin falsos positivos.
 * 2. **Palabras marcadoras de otros idiomas latinos** (portugués, italiano,
 *    alemán, francés, polaco, turco…). Acá hay que ser conservador: solo
 *    palabras que no existen (o son rarísimas) en español y en inglés, para no
 *    descartar una guía buena por un término suelto.
 */
const NON_LATIN_SCRIPT =
  /[\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

const OTHER_LANGUAGE_PATTERNS: RegExp[] = [
  // Portugués.
  /\b(portugu[eê]s|conquistas|trof[ée]us|jogo|detonado)\b/i,
  // Italiano.
  /\b(italiano|obiettivi|guida|gioco|trofei)\b/i,
  // Alemán.
  /\b(deutsch|erfolge|komplettl[öo]sung|leitfaden|spiel)\b/i,
  // Francés.
  /\b(fran[çc]ais|succ[èe]s|troph[ée]es|jeu|solution\s+compl[èe]te)\b/i,
  // Polaco, checo, turco, rumano, húngaro.
  /\b(polski|poradnik|osi[aą]gni[eę]cia|[čc]esk[yý]|n[áa]vod|t[üu]rk[çc]e|rehber|ba[şs]ar[ıi]mlar|ghid|rom[âa]n[ăa]|magyar|[úu]tmutat[óo])\b/i,
  // Neerlandés y nórdicos.
  /\b(nederlands|handleiding|prestaties|svenska|norsk|suomi|opas)\b/i,
];

/**
 * true si el título está en español o en inglés — o al menos no hay evidencia
 * de que esté en otro idioma. Todo lo demás se descarta: una guía que el
 * usuario no puede leer es ruido, por bien puntuada que esté.
 */
export function isReadableLanguage(title: string): boolean {
  if (NON_LATIN_SCRIPT.test(title)) return false;
  return !OTHER_LANGUAGE_PATTERNS.some((pattern) => pattern.test(title));
}

export type RankableGuide = { title: string };

/** true si el título es ruido conocido (traducción, mod, fix de performance). */
export function isNoiseTitle(title: string): boolean {
  return NOISE_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

/** Cuántos patrones de relevancia matchea el título. 0 = no aporta nada. */
export function relevanceScore(title: string): number {
  return RELEVANT_TITLE_PATTERNS.filter((pattern) => pattern.test(title)).length;
}

/**
 * Ordena por relevancia y saca el ruido.
 *
 * Se descarta además todo lo que no esté en español o en inglés
 * (`isReadableLanguage`), sin importar cuántos votos tenga.
 *
 * `taggedIds` son los ids que Steam ya devolvió bajo una etiqueta relevante
 * (Achievements, Walkthroughs, etc.): esos entran aunque el título no diga
 * ninguna palabra clave, porque la etiqueta la puso el autor de la guía y es
 * mejor señal que adivinar por el nombre. Los que vienen sólo de la búsqueda
 * por texto tienen que ganarse el lugar con el título.
 */
export function rankSteamGuides<T extends RankableGuide>(
  guides: (T & { id: string })[],
  taggedIds: ReadonlySet<string>,
  limit: number,
): T[] {
  return guides
    .filter((guide) => !isNoiseTitle(guide.title) && isReadableLanguage(guide.title))
    .map((guide) => ({
      guide,
      score: relevanceScore(guide.title) + (taggedIds.has(guide.id) ? 3 : 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ guide }) => guide);
}
