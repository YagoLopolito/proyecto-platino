import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { searchCatalog } from "@/lib/catalog/actions";
import { searchCompanies } from "@/lib/igdb";
import { matchesSearch } from "@/lib/library/search";
import { searchPublicLists, type ListRowData } from "@/lib/lists/queries";
import { getSystemListRows } from "@/lib/lists/system";
import { parseSearchScope, type RecentSearch } from "./scopes";

export type { RecentSearch };

type Client = SupabaseClient<Database>;

/**
 * Lo que se busca desde `/buscar` (epic #183, issue #194). Cada ámbito tiene
 * su función y la pantalla corre sólo la de la tab abierta: buscar en IGDB
 * para mostrar la tab Usuarios sería gastar el rate limit en nada.
 */

export interface GameHit {
  key: string;
  /** Ficha del juego; si viene de RAWG, la ruta que lo materializa. */
  href: string;
  name: string;
  coverUrl: string | null;
  releaseYear: number | null;
  platform: string | null;
  inLibrary: boolean;
}

export type GameSearch =
  { status: "ok" | "missing_api_key"; hits: GameHit[] } | { status: "error"; message: string };

/** `searchCatalog` (juegos de la base + RAWG), con los de tu biblioteca primero. */
export async function searchGames(
  supabase: Client,
  userId: string,
  query: string,
): Promise<GameSearch> {
  const outcome = await searchCatalog(query);
  if (outcome.status === "error") return outcome;

  const ids = outcome.results.flatMap((result) => (result.gameId ? [result.gameId] : []));
  const { data: owned } = ids.length
    ? await supabase.from("user_games").select("game_id").eq("user_id", userId).in("game_id", ids)
    : { data: [] };
  const ownedIds = new Set((owned ?? []).map((row) => row.game_id));

  const hits: GameHit[] = outcome.results.flatMap((result) => {
    const href = result.gameId
      ? `/juegos/${result.gameId}`
      : result.externalId
        ? `/juegos/catalogo/${encodeURIComponent(result.externalId)}`
        : null;
    if (!href) return [];
    return [
      {
        key: result.gameId ?? `rawg-${result.externalId}`,
        href,
        name: result.name,
        coverUrl: result.coverUrl,
        releaseYear: result.releaseYear ?? null,
        platform: result.platform ?? null,
        inLibrary: result.gameId ? ownedIds.has(result.gameId) : false,
      },
    ];
  });
  // `sort` es estable: dentro de cada grupo se respeta la relevancia.
  hits.sort((a, b) => Number(b.inLibrary) - Number(a.inLibrary));
  return { status: outcome.status, hits };
}

export interface StudioHit {
  slug: string;
  name: string;
  logoUrl: string | null;
  gameCount: number | null;
}

export type StudioSearch = { hits: StudioHit[]; igdbUnavailable: boolean };

function cachedGameCount(cache: unknown): number | null {
  if (typeof cache !== "object" || cache === null) return null;
  const { developed, published } = cache as Record<string, unknown>;
  const ids = new Set<number>();
  for (const list of [developed, published]) {
    if (!Array.isArray(list)) continue;
    for (const game of list) {
      const id = (game as Record<string, unknown> | null)?.igdbId;
      if (typeof id === "number") ids.add(id);
    }
  }
  return ids.size;
}

/**
 * Los estudios ya guardados en `companies` más la búsqueda de IGDB, sin
 * repetir. Con `withIgdb: false` (la tab "Todo") sólo los guardados: IGDB es
 * la consulta más lenta y la tab Estudios está a un toque.
 */
export async function searchStudios(
  supabase: Client,
  query: string,
  { withIgdb = true }: { withIgdb?: boolean } = {},
): Promise<StudioSearch> {
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const [{ data: cached }, igdb] = await Promise.all([
    supabase
      .from("companies")
      .select("igdb_id, name, slug, logo_url, games_cache")
      .ilike("name", pattern)
      .limit(20),
    withIgdb ? searchCompanies(query) : Promise.resolve(null),
  ]);

  const byIgdbId = new Map<number, StudioHit>();
  for (const row of cached ?? []) {
    byIgdbId.set(row.igdb_id, {
      slug: row.slug,
      name: row.name,
      logoUrl: row.logo_url,
      gameCount: cachedGameCount(row.games_cache),
    });
  }
  if (igdb?.status === "ok") {
    for (const hit of igdb.value) {
      const current = byIgdbId.get(hit.igdbId);
      // IGDB sabe el total aunque el caché todavía no se haya llenado.
      byIgdbId.set(hit.igdbId, {
        slug: hit.slug,
        name: hit.name,
        logoUrl: current?.logoUrl ?? hit.logoUrl,
        gameCount: hit.gameCount,
      });
    }
  }
  return {
    hits: [...byIgdbId.values()].sort((a, b) => (b.gameCount ?? 0) - (a.gameCount ?? 0)),
    igdbUnavailable: igdb?.status === "unavailable",
  };
}

/** Listas públicas de usuarios y pregeneradas, por título. */
export async function searchLists(
  supabase: Client,
  viewerId: string,
  query: string,
): Promise<ListRowData[]> {
  const [system, user] = await Promise.all([
    getSystemListRows(supabase, viewerId),
    searchPublicLists(supabase, viewerId, query),
  ]);
  return [...system.filter((list) => matchesSearch(list.title, query)), ...user];
}

/** Las búsquedas recientes de quien mira, la última primero. */
export async function getRecentSearches(supabase: Client, userId: string): Promise<RecentSearch[]> {
  const { data } = await supabase
    .from("recent_searches")
    .select("id, query, scope")
    .eq("user_id", userId)
    .order("searched_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    query: row.query,
    scope: parseSearchScope(row.scope),
  }));
}
