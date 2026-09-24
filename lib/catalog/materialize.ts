import "server-only";
import { fetchGameDetails } from "@/lib/covers";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchIgdbGameDetails } from "@/lib/igdb";
import { IGDB_CATALOG_PREFIX } from "./details";

/**
 * Devuelve el `games.id` de un juego del catálogo externo (RAWG), creando la
 * fila si todavía no existe. Epic #183, issue #186: cualquier juego tiene
 * ficha, lo tengas o no en tu biblioteca.
 *
 * Diferencias con `addCatalogGame` (lib/catalog/actions.ts), que es el alta
 * desde "Marcar como terminado":
 *
 * - **No vincula el juego a `user_games`.** Abrir la ficha de un juego no es
 *   agregarlo a tu biblioteca; eso pasa recién cuando registrás una partida.
 * - **Va por service role**, como `persistGameCardData`: la fila es catálogo
 *   público compartido y no es "de" quien la abrió primero (`created_by` queda
 *   en NULL, así nadie la puede editar desde su sesión).
 * - **Deduplica en la base**, con el índice único de `external_catalog_id`
 *   (migración `20260923000000`) y `on conflict do nothing`: dos personas
 *   abriendo el mismo juego a la vez no crean dos filas. Si el insert no
 *   devuelve nada es porque otro llegó primero, y se relee.
 *
 * `null` = RAWG no conoce ese id (o no se lo pudo consultar): el caller
 * responde 404 en vez de crear una ficha vacía.
 */
export async function materializeCatalogGame(externalId: string): Promise<string | null> {
  const supabase = createServiceClient();

  const existing = await findByExternalId(supabase, externalId);
  if (existing) return existing;

  const details = await fetchGameDetails(externalId);
  if (!details?.name) return null;

  const { data: inserted } = await supabase
    .from("games")
    .upsert(
      {
        name: details.name,
        source: "catalog",
        external_catalog_id: externalId,
        cover_url: details.coverUrl,
        background_url: details.backgroundUrl,
        description: details.description,
        description_source: details.description ? "rawg" : null,
        developer: details.developer,
        release_year: details.releaseYear,
      },
      { onConflict: "external_catalog_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  return inserted?.id ?? (await findByExternalId(supabase, externalId));
}

async function findByExternalId(
  supabase: ReturnType<typeof createServiceClient>,
  externalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("games")
    .select("id")
    .eq("external_catalog_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Lo mismo que `materializeCatalogGame`, pero para un juego de IGDB (los
 * juegos de un estudio que nadie tiene todavía, issue #193).
 *
 * La unicidad reusa el índice único de `external_catalog_id`, con el prefijo
 * `igdb:` para que no choque con un id de RAWG. Antes de crear nada se busca
 * por `games.igdb_id`: si el juego ya está en la base (sincronizado por PSN o
 * Steam, o abierto antes desde otro lado), se abre ese.
 */
export async function materializeIgdbGame(igdbId: number): Promise<string | null> {
  const supabase = createServiceClient();

  const { data: known } = await supabase
    .from("games")
    .select("id")
    .eq("igdb_id", igdbId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (known) return known.id;

  const externalId = `${IGDB_CATALOG_PREFIX}${igdbId}`;
  const existing = await findByExternalId(supabase, externalId);
  if (existing) return existing;

  const details = await fetchIgdbGameDetails(igdbId);
  if (!details) return null;

  const { data: inserted } = await supabase
    .from("games")
    .upsert(
      {
        name: details.name,
        source: "catalog",
        external_catalog_id: externalId,
        igdb_id: igdbId,
        cover_url: details.coverUrl,
        description: details.description,
        description_source: details.description ? "igdb" : null,
        release_year: details.releaseYear,
      },
      { onConflict: "external_catalog_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  return inserted?.id ?? (await findByExternalId(supabase, externalId));
}
