import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { MIN_RATINGS_FOR_AVERAGE } from "@/components/diary/GameScore";
import { getPlaylist } from "@/lib/playlist/queries";
import { sortPlaylist } from "@/lib/playlist/sort";
import type { ListItem, ListRowData } from "./queries";
import {
  MAX_SYSTEM_LIST_ITEMS,
  MIN_SYSTEM_LIST_ITEMS,
  isPersonalSystemList,
  systemListMeta,
  type PersonalSystemListSlug,
  type SystemListMeta,
} from "./system-catalog";

type Client = SupabaseClient<Database>;

/** Cuántas carátulas lleva la tira de pósters de una fila de lista. */
const ROW_COVERS = 8;
/** Diario de amigos que se lee para "Populares entre tus amigos". */
const FRIENDS_DIARY_LIMIT = 2000;

export interface SystemListDetail {
  meta: SystemListMeta;
  items: ListItem[];
}

/**
 * Recalcula las listas pregeneradas que no dependen del usuario. La llama el
 * cron (`/api/cron/sync`) con el cliente de service role: la función de la
 * base no se puede ejecutar con la sesión de un usuario.
 */
export async function refreshSystemLists(service: Client): Promise<number> {
  const { data, error } = await service.rpc("refresh_system_lists", {
    p_min_ratings: MIN_RATINGS_FOR_AVERAGE,
    p_min_items: MIN_SYSTEM_LIST_ITEMS,
    p_max_items: MAX_SYSTEM_LIST_ITEMS,
  });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

type GameRow = {
  id: string;
  name: string;
  cover_url: string | null;
  icon_url: string | null;
  release_year: number | null;
};

function toItem(game: GameRow, position: number): ListItem {
  return {
    gameId: game.id,
    name: game.name,
    imageUrl: game.cover_url ?? game.icon_url,
    releaseYear: game.release_year,
    position,
    note: null,
  };
}

/** Los juegos de una lista cacheada por el cron, en orden (hasta `MAX_SYSTEM_LIST_ITEMS`). */
async function getGlobalListItems(supabase: Client, slug: string): Promise<ListItem[]> {
  const { data } = await supabase
    .from("system_list_items")
    .select("position, games (id, name, cover_url, icon_url, release_year)")
    .eq("list_slug", slug)
    .order("position");
  return (data ?? []).flatMap((row) => (row.games ? [toItem(row.games, row.position)] : []));
}

/**
 * Las listas cacheadas por el cron, para la tab: cuántos juegos tiene cada una
 * y sólo sus primeras carátulas. Traer todos los juegos de todas las listas
 * pasaría el tope de 1000 filas de PostgREST en cuanto haya varios años.
 */
async function getGlobalListPreviews(
  supabase: Client,
): Promise<{ meta: SystemListMeta; itemCount: number; covers: (string | null)[] }[]> {
  const [{ data: lists }, { data: items }] = await Promise.all([
    supabase.from("system_lists").select("slug, item_count"),
    supabase
      .from("system_list_items")
      .select("list_slug, position, games (cover_url, icon_url)")
      .lte("position", ROW_COVERS)
      .order("position"),
  ]);

  const covers = new Map<string, (string | null)[]>();
  for (const item of items ?? []) {
    if (!item.games) continue;
    const list = covers.get(item.list_slug) ?? [];
    list.push(item.games.cover_url ?? item.games.icon_url);
    covers.set(item.list_slug, list);
  }

  return (lists ?? []).flatMap((list) => {
    const meta = systemListMeta(list.slug);
    const listCovers = covers.get(list.slug) ?? [];
    // Un juego borrado después del cálculo (en cascada) achica la lista: si ya
    // no llegan las primeras carátulas, el conteo guardado está viejo.
    const itemCount =
      listCovers.length < ROW_COVERS
        ? Math.min(list.item_count, listCovers.length)
        : list.item_count;
    return meta ? [{ meta, itemCount, covers: listCovers }] : [];
  });
}

/**
 * "Populares entre tus amigos": los juegos que más gente de la que seguís
 * registró en su diario (que es público), una vez por persona. Empates: el
 * registrado más recientemente primero.
 */
async function getFriendsPopularItems(supabase: Client, viewerId: string): Promise<ListItem[]> {
  const { data: friendships } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", viewerId);
  const friendIds = (friendships ?? []).map((row) => row.friend_id);
  if (friendIds.length === 0) return [];

  const { data: entries } = await supabase
    .from("game_diary_entries")
    .select("user_id, finished_on, games (id, name, cover_url, icon_url, release_year)")
    .in("user_id", friendIds)
    .order("finished_on", { ascending: false })
    .limit(FRIENDS_DIARY_LIMIT);

  const byGame = new Map<string, { game: GameRow; users: Set<string>; latest: string }>();
  for (const entry of entries ?? []) {
    if (!entry.games) continue;
    const current = byGame.get(entry.games.id) ?? {
      game: entry.games,
      users: new Set<string>(),
      latest: entry.finished_on,
    };
    current.users.add(entry.user_id);
    if (entry.finished_on > current.latest) current.latest = entry.finished_on;
    byGame.set(entry.games.id, current);
  }

  return [...byGame.values()]
    .sort(
      (a, b) =>
        b.users.size - a.users.size ||
        b.latest.localeCompare(a.latest) ||
        a.game.name.localeCompare(b.game.name, "es"),
    )
    .slice(0, MAX_SYSTEM_LIST_ITEMS)
    .map((entry, index) => toItem(entry.game, index + 1));
}

/** "Tu Playlist, la más corta primero": el mismo orden que `?orden=tiempo`. */
async function getShortPlaylistItems(supabase: Client, viewerId: string): Promise<ListItem[]> {
  const playlist = sortPlaylist(await getPlaylist(supabase, viewerId), "tiempo");
  return playlist.slice(0, MAX_SYSTEM_LIST_ITEMS).map((game, index) => ({
    gameId: game.id,
    name: game.name,
    imageUrl: game.imageUrl,
    releaseYear: game.releaseYear,
    position: index + 1,
    note: null,
  }));
}

function getPersonalItems(
  supabase: Client,
  viewerId: string,
  slug: PersonalSystemListSlug,
): Promise<ListItem[]> {
  return slug === "populares-entre-amigos"
    ? getFriendsPopularItems(supabase, viewerId)
    : getShortPlaylistItems(supabase, viewerId);
}

function toRow(meta: SystemListMeta, itemCount: number, covers: (string | null)[]): ListRowData {
  return {
    href: `/listas/sistema/${meta.slug}`,
    title: meta.title,
    description: meta.description,
    author: null,
    itemCount,
    covers: covers.slice(0, ROW_COVERS),
    likeCount: null,
  };
}

/**
 * Todas las pregeneradas que tiene sentido mostrarle a quien mira, en el orden
 * del catálogo. Una lista con menos de `MIN_SYSTEM_LIST_ITEMS` juegos no se
 * muestra: el cron ya no las guarda, pero una cacheada puede haberse achicado
 * después (un juego borrado se va en cascada) y las personales se calculan acá.
 */
export async function getSystemListRows(
  supabase: Client,
  viewerId: string,
): Promise<ListRowData[]> {
  const [global, friends, playlist] = await Promise.all([
    getGlobalListPreviews(supabase),
    getPersonalItems(supabase, viewerId, "populares-entre-amigos"),
    getPersonalItems(supabase, viewerId, "tu-playlist-corta"),
  ]);

  const personal = (slug: PersonalSystemListSlug, items: ListItem[]) => ({
    meta: systemListMeta(slug)!,
    itemCount: items.length,
    covers: items.map((item) => item.imageUrl),
  });

  return [
    ...global,
    personal("populares-entre-amigos", friends),
    personal("tu-playlist-corta", playlist),
  ]
    .filter((list) => list.itemCount >= MIN_SYSTEM_LIST_ITEMS)
    .sort((a, b) => a.meta.sortOrder - b.meta.sortOrder)
    .map((list) => toRow(list.meta, list.itemCount, list.covers));
}

/** Una pregenerada con sus juegos, o `null` si no existe o no llega al mínimo (404). */
export async function getSystemList(
  supabase: Client,
  viewerId: string,
  slug: string,
): Promise<SystemListDetail | null> {
  const meta = systemListMeta(slug);
  if (!meta) return null;

  const items = isPersonalSystemList(slug)
    ? await getPersonalItems(supabase, viewerId, slug)
    : await getGlobalListItems(supabase, slug);

  if (items.length < MIN_SYSTEM_LIST_ITEMS) return null;
  return { meta, items };
}
