import "server-only";

export type SiteSearchSource =
  | "PowerPyx"
  | "PSNProfiles"
  | "TrueTrophies"
  | "YouTube";

export type SiteSearchLink = {
  title: string;
  url: string;
  source: SiteSearchSource;
};

/**
 * Alternativa 100% gratuita a la búsqueda con IA (que requiere créditos de
 * la API de Anthropic): en vez de pedirle a un modelo que busque y devuelva
 * la URL exacta de la guía, arma un link a la búsqueda propia de cada sitio.
 * No hace scraping (no se fetchea ni se lee el HTML de esos sitios, solo se
 * construye la URL) ni depende de ninguna API paga -- el usuario abre el
 * link y navega los resultados en su propio browser. Mismo espíritu que
 * "Enlaces a fuentes externas" en CLAUDE.md: citar la fuente, nunca copiar
 * contenido de terceros.
 *
 * Cada link apunta a guías de trofeos/logros, no al juego en general:
 * - PowerPyx y YouTube son buscadores de texto libre sobre todo su contenido
 *   (noticias, reviews, videos de cualquier tema), así que el query lleva las
 *   palabras "trophy guide"/"platinum walkthrough" pegadas al nombre del
 *   juego. Sin eso devolvían cualquier artículo del juego.
 * - PSNProfiles y TrueTrophies son sitios dedicados a trofeos: su buscador
 *   de juegos ya es 100% relevante y la ficha del juego lleva directo a la
 *   guía/walkthrough. Ahí conviene el buscador de juegos y no uno de texto
 *   libre, que devuelve posts de foro sueltos.
 */
export function buildSiteSearchLinks(gameName: string): SiteSearchLink[] {
  const trophyQuery = encodeURIComponent(`${gameName} trophy guide`);
  const gameQuery = encodeURIComponent(gameName);
  const videoQuery = encodeURIComponent(`${gameName} platinum trophy guide walkthrough`);

  return [
    {
      title: `Guía de trofeos de "${gameName}" en PowerPyx`,
      url: `https://www.powerpyx.com/?s=${trophyQuery}`,
      source: "PowerPyx",
    },
    {
      title: `Guías de trofeos de "${gameName}" en PSNProfiles`,
      url: `https://psnprofiles.com/search/games?q=${gameQuery}`,
      source: "PSNProfiles",
    },
    {
      title: `Guías de trofeos de "${gameName}" en TrueTrophies`,
      url: `https://www.truetrophies.com/game_search.php?search=${gameQuery}`,
      source: "TrueTrophies",
    },
    {
      title: `Guías de trofeos de "${gameName}" en video (YouTube)`,
      url: `https://www.youtube.com/results?search_query=${videoQuery}`,
      source: "YouTube",
    },
  ];
}
