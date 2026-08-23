import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  fetchGameDetails,
  findGameDetailsByName,
  findHeroImageUrl,
  findSteamHeroUrl,
} from "@/lib/covers";
import { generateGameDescription } from "@/lib/ai";

export interface GameCardData {
  id: string;
  name: string;
  platform: string | null;
  coverUrl: string | null;
  backgroundUrl: string | null;
  description: string | null;
  /** "rawg" | "ai" | null -- la UI aclara cuando la descripción la generó el LLM. */
  descriptionSource: string | null;
  developer: string | null;
  releaseYear: number | null;
}

type GameRow = {
  id: string;
  name: string;
  platform: string | null;
  cover_url: string | null;
  icon_url: string | null;
  background_url: string | null;
  description: string | null;
  description_source: string | null;
  developer: string | null;
  release_year: number | null;
  external_catalog_id: string | null;
};

export const GAME_CARD_COLUMNS =
  "id, name, platform, cover_url, icon_url, background_url, description, description_source, developer, release_year, external_catalog_id";

function toCardData(game: GameRow): GameCardData {
  return {
    id: game.id,
    name: game.name,
    platform: game.platform,
    coverUrl: game.cover_url ?? game.icon_url,
    backgroundUrl: game.background_url,
    description: game.description,
    descriptionSource: game.description_source,
    developer: game.developer,
    releaseYear: game.release_year,
  };
}

/**
 * Datos de ficha del juego (descripción, desarrolladora, año, fondo) para la
 * vista tipo Letterbox del diario. Se cachean en `games` la primera vez que
 * alguien abre la ficha: RAWG solo se consulta si la fila todavía no los tiene.
 *
 * El update puede quedar bloqueado silenciosamente por la RLS de `games` (solo
 * el dueño de la fila puede actualizarla); en ese caso igual se devuelven los
 * datos recién traídos, así el usuario ve la ficha completa aunque el juego lo
 * haya creado otro. Todo va en try/catch: es información decorativa, nunca
 * puede tirar abajo la página del diario.
 */
export async function getGameCardData(
  supabase: SupabaseClient<Database>,
  game: GameRow,
): Promise<GameCardData> {
  const base = toCardData(game);
  // Los strings vacíos son la marca de "ya buscamos y no había nada": evitan
  // repetir el fetch a RAWG/SteamGridDB/LLM en cada visita a la ficha.
  const needsDescription = game.description === null;
  const needsBackground = game.background_url === null;
  if (!needsDescription && !needsBackground) return base;

  try {
    const [details, heroUrl] = await Promise.all([
      needsDescription
        ? game.external_catalog_id
          ? fetchGameDetails(game.external_catalog_id)
          : findGameDetailsByName(game.name)
        : Promise.resolve(null),
      // SteamGridDB primero (arte curado) y, si falta la key o no lo tiene, la
      // CDN pública de Steam, que no necesita ninguna key.
      needsBackground
        ? findHeroImageUrl(game.name).then((hero) => hero ?? findSteamHeroUrl(game.name))
        : Promise.resolve(null),
    ]);

    // Wallpaper: primero el "hero" de SteamGridDB (arte apaisado hecho para
    // banners), y si no hay, la imagen de RAWG.
    const backgroundUrl = needsBackground
      ? (heroUrl ?? details?.backgroundUrl ?? "")
      : game.background_url;

    let description = needsDescription ? (details?.description?.trim() ?? "") : game.description;
    let descriptionSource = game.description_source;

    if (needsDescription && description === "") {
      // RAWG no tenía descripción: se genera una con el LLM y se guarda marcada
      // como generada por IA. Si el modelo no conoce el juego o falla el
      // proveedor, la ficha queda sin descripción (nunca inventamos en silencio).
      try {
        const generated = await generateGameDescription({
          gameName: game.name,
          platform: game.platform,
          releaseYear: details?.releaseYear ?? game.release_year,
          developer: details?.developer ?? game.developer,
        });
        if (generated) {
          description = generated;
          descriptionSource = "ai";
        }
      } catch (cause) {
        // AiProviderError (falta la key, rate limit de Groq): no rompe la
        // ficha, pero se loguea -- si todas las descripciones salen vacías,
        // esto es lo que dice por qué.
        console.error(`[game-details] falló la descripción por IA de "${game.name}":`, cause);
      }
    } else if (needsDescription && description !== "") {
      descriptionSource = "rawg";
    }

    await supabase
      .from("games")
      .update({
        ...(needsDescription
          ? {
              description,
              description_source: descriptionSource,
              developer: details?.developer ?? game.developer,
              release_year: details?.releaseYear ?? game.release_year,
              ...(game.cover_url === null && details?.coverUrl
                ? { cover_url: details.coverUrl }
                : {}),
            }
          : {}),
        ...(needsBackground ? { background_url: backgroundUrl } : {}),
      })
      .eq("id", game.id);

    return {
      ...base,
      coverUrl: base.coverUrl ?? details?.coverUrl ?? null,
      backgroundUrl: backgroundUrl || null,
      description: description || null,
      descriptionSource,
      developer: details?.developer ?? base.developer,
      releaseYear: details?.releaseYear ?? base.releaseYear,
    };
  } catch {
    return base;
  }
}
