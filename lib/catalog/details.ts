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
import { fetchTimeEstimates } from "@/lib/time-to-beat";
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
  /** Minutos estimados para terminar la historia principal (HowLongToBeat-style). */
  timeToBeatMinutes: number | null;
  /** Minutos estimados para llegar al 100%. RAWG no lo publica: sólo sale de IGDB. */
  timeToCompleteMinutes: number | null;
  /** "igdb" | "rawg" | "none" | null -- la ficha cita la fuente del dato. */
  timeEstimatesSource: string | null;
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
  time_to_beat_minutes: number | null;
  time_to_complete_minutes: number | null;
  time_estimates_source: string | null;
  time_estimates_checked_at: string | null;
};

export const GAME_CARD_COLUMNS =
  "id, name, platform, cover_url, icon_url, background_url, description, description_source, developer, release_year, external_catalog_id, time_to_beat_minutes, time_to_complete_minutes, time_estimates_source, time_estimates_checked_at";

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
    timeToBeatMinutes: game.time_to_beat_minutes,
    timeToCompleteMinutes: game.time_to_complete_minutes,
    timeEstimatesSource: game.time_estimates_source,
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
  // Los tiempos estimados se consultan una sola vez por juego: `checked_at`
  // con valor significa "ya preguntamos", aunque las dos columnas hayan
  // quedado en NULL porque ninguna fuente lo conocía.
  const needsTimeEstimates = game.time_estimates_checked_at === null;
  if (!needsDescription && !needsBackground && !needsCover && !needsTimeEstimates) return base;

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

    // Un fetch extra a IGDB sólo en la primera visita a la ficha; a partir de
    // ahí sale del caché en `games`.
    //
    // `null` significa dos cosas distintas, y las dos terminan en lo mismo (no
    // escribir el caché): que no hacía falta consultar, o que **no se pudo**
    // (sin credenciales, red, 401). Ese segundo caso no se marca como
    // consultado a propósito: si no, un fallo transitorio dejaría el juego sin
    // tiempos para siempre. Cuando IGDB contesta y no sabe, devuelve
    // `source: "none"`, que sí se cachea.
    const estimates = needsTimeEstimates ? await fetchTimeEstimates(game.name) : null;

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
      ...(estimates
        ? {
            time_to_beat_minutes: estimates.beatMinutes,
            time_to_complete_minutes: estimates.completeMinutes,
            time_estimates_source: estimates.source,
            time_estimates_checked_at: new Date().toISOString(),
          }
        : {}),
    });

    return {
      ...base,
      coverUrl: coverUrl ?? base.coverUrl,
      backgroundUrl: backgroundUrl || null,
      description: description || null,
      descriptionSource,
      developer: details?.developer ?? base.developer,
      releaseYear: details?.releaseYear ?? base.releaseYear,
      timeToBeatMinutes: estimates?.beatMinutes ?? base.timeToBeatMinutes,
      timeToCompleteMinutes: estimates?.completeMinutes ?? base.timeToCompleteMinutes,
      timeEstimatesSource: estimates?.source ?? base.timeEstimatesSource,
    };
  } catch {
    return base;
  }
}
