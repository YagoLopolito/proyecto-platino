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
import { createServiceClient } from "@/lib/supabase/service";

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
 * Guarda los datos de catálogo recién traídos (descripción, fondo, carátula).
 *
 * Va con el cliente de service role y no con el del usuario a propósito: la
 * RLS de `games` sólo deja actualizar las filas propias (`created_by`), así
 * que con el cliente de sesión el caché no se escribía nunca para un juego
 * que sincronizó otro usuario -- y con dos cuentas en la app eso es la mitad
 * del catálogo. El resultado era que la ficha volvía a pegarle a
 * RAWG/SteamGridDB/Groq en **cada visita** y, si alguna de esas respuestas
 * fallaba o tardaba, la ficha se mostraba sin fondo y sin descripción; la
 * siguiente visita podía mostrarlos de nuevo. Son datos públicos y
 * decorativos del catálogo compartido (nada por usuario), el mismo criterio
 * que ya usa `lib/external-guides/`.
 *
 * Si falta `SUPABASE_SERVICE_ROLE_KEY` se cae al cliente del usuario, que es
 * lo que había antes: peor caché, pero nunca un error en pantalla.
 */
async function persistGameCardData(
  supabase: SupabaseClient<Database>,
  gameId: string,
  patch: Database["public"]["Tables"]["games"]["Update"],
): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  let writer: SupabaseClient<Database> = supabase;
  try {
    writer = createServiceClient();
  } catch {
    // Sin service role key: se intenta igual con la sesión del usuario.
  }

  const { error } = await writer.from("games").update(patch).eq("id", gameId);
  if (error) {
    console.error(`[game-details] no se pudo cachear la ficha de ${gameId}:`, error.message);
  }
}

/**
 * Datos de ficha del juego (descripción, desarrolladora, año, fondo, carátula)
 * para la vista tipo Letterbox del diario. Se cachean en `games` la primera vez
 * que alguien abre la ficha: las fuentes externas sólo se consultan si la fila
 * todavía no los tiene.
 *
 * Todo va en try/catch: es información decorativa, nunca puede tirar abajo la
 * página del diario.
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
  // Muchos juegos de PSN quedan sin `cover_url` y sólo con el ícono cuadrado
  // del set de trofeos, que estirado al póster 3:4 de la biblioteca se ve
  // pixelado o directamente vacío. Si ya estamos consultando RAWG por la ficha,
  // aprovechamos para completar la carátula real.
  const needsCover = game.cover_url === null;
  if (!needsDescription && !needsBackground && !needsCover) return base;

  try {
    const wantsRawg = needsDescription || needsCover;
    const [details, heroUrl] = await Promise.all([
      wantsRawg
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

    const coverUrl = needsCover ? (details?.coverUrl ?? null) : game.cover_url;

    await persistGameCardData(supabase, game.id, {
      ...(needsDescription
        ? {
            description,
            description_source: descriptionSource,
            developer: details?.developer ?? game.developer,
            release_year: details?.releaseYear ?? game.release_year,
          }
        : {}),
      ...(needsBackground ? { background_url: backgroundUrl } : {}),
      ...(needsCover && coverUrl ? { cover_url: coverUrl } : {}),
    });

    return {
      ...base,
      coverUrl: coverUrl ?? base.coverUrl,
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
