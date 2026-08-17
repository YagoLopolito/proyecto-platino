import "server-only";

export type SiteSearchLink = {
  title: string;
  url: string;
  source: "PowerPyx" | "PSNProfiles" | "TrueTrophies";
};

/**
 * Alternativa 100% gratuita a la búsqueda con IA (que requiere créditos de
 * la API de Anthropic): en vez de pedirle a un modelo que busque y devuelva
 * la URL exacta de la guía, arma un link a la búsqueda propia de cada sitio
 * para ese juego. No hace scraping (no se fetchea ni se lee el HTML de esos
 * sitios, solo se construye la URL) ni depende de ninguna API paga -- el
 * usuario abre el link y navega los resultados en su propio browser. Mismo
 * espíritu que "Enlaces a fuentes externas" en CLAUDE.md: citar la fuente,
 * nunca copiar contenido de terceros.
 */
export function buildSiteSearchLinks(gameName: string): SiteSearchLink[] {
  const query = encodeURIComponent(gameName);

  return [
    {
      title: `Buscar "${gameName}" en PowerPyx`,
      url: `https://www.powerpyx.com/?s=${query}`,
      source: "PowerPyx",
    },
    {
      title: `Buscar "${gameName}" en PSNProfiles`,
      url: `https://psnprofiles.com/search/games?q=${query}`,
      source: "PSNProfiles",
    },
    {
      title: `Buscar "${gameName}" en TrueTrophies`,
      url: `https://www.truetrophies.com/game_search.php?search=${query}`,
      source: "TrueTrophies",
    },
  ];
}
