import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ListVisibility } from "./constants";

type Client = SupabaseClient<Database>;

/** Cuántas carátulas lleva la portada de una lista en las grillas de listas. */
const LIST_PREVIEW_COVERS = 4;

/** Una lista para mostrar como tarjeta (perfil, "agregar a una lista"). */
export interface ListSummary {
  id: string;
  title: string;
  isRanked: boolean;
  visibility: ListVisibility;
  itemCount: number;
  updatedAt: string;
  /** Las primeras carátulas, en el orden de la lista. */
  covers: (string | null)[];
  gameIds: string[];
}

/**
 * Las listas de un usuario, la última editada primero. La RLS decide qué ve
 * quien consulta: las privadas sólo aparecen si es el dueño.
 */
export async function getUserLists(supabase: Client, ownerId: string): Promise<ListSummary[]> {
  const { data } = await supabase
    .from("user_lists")
    .select(
      "id, title, is_ranked, visibility, updated_at, user_list_items (game_id, position, games (cover_url, icon_url))",
    )
    .eq("user_id", ownerId)
    .order("updated_at", { ascending: false });

  return (data ?? []).map((list) => {
    const items = [...(list.user_list_items ?? [])].sort((a, b) => a.position - b.position);
    return {
      id: list.id,
      title: list.title,
      isRanked: list.is_ranked,
      visibility: list.visibility as ListVisibility,
      itemCount: items.length,
      updatedAt: list.updated_at,
      covers: items
        .slice(0, LIST_PREVIEW_COVERS)
        .map((item) => item.games?.cover_url ?? item.games?.icon_url ?? null),
      gameIds: items.map((item) => item.game_id),
    };
  });
}

export interface ListItem {
  gameId: string;
  name: string;
  imageUrl: string | null;
  releaseYear: number | null;
  position: number;
  note: string | null;
}

export interface ListDetail {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  isRanked: boolean;
  visibility: ListVisibility;
  createdAt: string;
  updatedAt: string;
  author: { name: string; avatarUrl: string | null };
  items: ListItem[];
}

/**
 * Una lista con sus juegos y su autor. `null` si no existe **o** si es privada
 * y no es de quien mira: la RLS no la devuelve y, para afuera, las dos cosas
 * son un 404 (no se confirma que exista una lista privada).
 */
export async function getList(supabase: Client, listId: string): Promise<ListDetail | null> {
  const { data: list } = await supabase
    .from("user_lists")
    .select(
      "id, user_id, title, description, is_ranked, visibility, created_at, updated_at, user_list_items (game_id, position, note, games (id, name, cover_url, icon_url, release_year))",
    )
    .eq("id", listId)
    .maybeSingle();
  if (!list) return null;

  const { data: author } = await supabase
    .from("public_profiles")
    .select("display_name, profile_name, profile_avatar_url")
    .eq("id", list.user_id)
    .maybeSingle();

  const items = (list.user_list_items ?? [])
    .flatMap((item) =>
      item.games
        ? [
            {
              gameId: item.game_id,
              name: item.games.name,
              imageUrl: item.games.cover_url ?? item.games.icon_url,
              releaseYear: item.games.release_year,
              position: item.position,
              note: item.note,
            },
          ]
        : [],
    )
    .sort((a, b) => a.position - b.position);

  return {
    id: list.id,
    ownerId: list.user_id,
    title: list.title,
    description: list.description,
    isRanked: list.is_ranked,
    visibility: list.visibility as ListVisibility,
    createdAt: list.created_at,
    updatedAt: list.updated_at,
    author: {
      name: author?.profile_name ?? author?.display_name ?? "Usuario sin nombre",
      avatarUrl: author?.profile_avatar_url ?? null,
    },
    items,
  };
}

/**
 * Cuántos de estos juegos "jugó" quien mira: platinado, al 100% o con una
 * entrada en su diario (la definición del epic #183). Es el "Vos jugaste N de
 * M" de la ficha de lista.
 *
 * El progreso sale de `get_library_trophy_stats()` (del usuario de la sesión,
 * RLS mediante) y el diario, que es público, se filtra por quien mira.
 */
export async function countPlayed(
  supabase: Client,
  viewerId: string,
  gameIds: string[],
): Promise<number> {
  return (await getPlayedGameIds(supabase, viewerId, gameIds)).size;
}

/** Cuáles de `gameIds` jugó quien mira (mismo criterio que `countPlayed`). */
export async function getPlayedGameIds(
  supabase: Client,
  viewerId: string,
  gameIds: string[],
): Promise<Set<string>> {
  if (gameIds.length === 0) return new Set();
  const wanted = new Set(gameIds);

  const [{ data: stats }, { data: diary }] = await Promise.all([
    supabase.rpc("get_library_trophy_stats"),
    supabase
      .from("game_diary_entries")
      .select("game_id")
      .eq("user_id", viewerId)
      .in("game_id", gameIds),
  ]);

  const played = new Set<string>((diary ?? []).map((row) => row.game_id));
  for (const row of stats ?? []) {
    if (!wanted.has(row.game_id)) continue;
    if (row.platinum > 0 || (row.total > 0 && row.obtained === row.total)) played.add(row.game_id);
  }
  return played;
}

/** En cuántas de tus listas está el juego (el estado del toggle "Lista" de la ficha). */
export async function countOwnListsWithGame(
  supabase: Client,
  userId: string,
  gameId: string,
): Promise<number> {
  const { count } = await supabase
    .from("user_list_items")
    .select("list_id, user_lists!inner (user_id)", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("user_lists.user_id", userId);
  return count ?? 0;
}

/** Cuántas carátulas lleva la tira de pósters de una fila de lista (`ListRow`). */
const ROW_COVERS = 8;
/** Los días que mira "Populares esta semana". */
const POPULAR_WINDOW_DAYS = 7;

/**
 * Una fila de lista para Biblioteca › Listas (epic #183, issue #192): una
 * lista de usuario o una pregenerada, con la misma forma.
 */
export interface ListRowData {
  href: string;
  title: string;
  description: string | null;
  /** `null` = la armó Platinoob (una pregenerada). */
  author: { name: string; avatarUrl: string | null } | null;
  itemCount: number;
  /** Hasta 8 carátulas, en el orden de la lista. */
  covers: (string | null)[];
  /** `null` = no se likea (las pregeneradas). */
  likeCount: number | null;
  /** Lista privada: sólo aparece en el perfil de su dueño, con candado (#197). */
  isPrivate?: boolean;
}

const LIST_ROW_SELECT =
  "id, user_id, title, description, visibility, created_at, user_list_items (position, games (cover_url, icon_url))";

type ListRowSource = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  visibility: string;
  user_list_items: {
    position: number;
    games: { cover_url: string | null; icon_url: string | null } | null;
  }[];
};

/**
 * Arma las filas con su autor y sus likes. Las listas sin juegos se descartan
 * al descubrir (no hay nada que mirar), pero no en el perfil de su dueño.
 */
async function toListRows(
  supabase: Client,
  viewerId: string,
  lists: ListRowSource[],
  { keepEmpty = false }: { keepEmpty?: boolean } = {},
): Promise<ListRowData[]> {
  const withItems = keepEmpty ? lists : lists.filter((list) => list.user_list_items.length > 0);
  if (withItems.length === 0) return [];

  const ownerIds = [...new Set(withItems.map((list) => list.user_id))];
  const [{ data: profiles }, { data: likes }] = await Promise.all([
    supabase
      .from("public_profiles")
      .select("id, display_name, profile_name, profile_avatar_url")
      .in("id", ownerIds),
    supabase
      .from("list_likes")
      .select("list_id")
      .in(
        "list_id",
        withItems.map((list) => list.id),
      ),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const likeCount = new Map<string, number>();
  for (const like of likes ?? []) {
    likeCount.set(like.list_id, (likeCount.get(like.list_id) ?? 0) + 1);
  }

  return withItems.map((list) => {
    const profile = profileById.get(list.user_id);
    const items = [...list.user_list_items].sort((a, b) => a.position - b.position);
    return {
      href: `/listas/${list.id}`,
      title: list.title,
      description: list.description,
      author: {
        name:
          list.user_id === viewerId
            ? "Vos"
            : (profile?.profile_name ?? profile?.display_name ?? "Usuario sin nombre"),
        avatarUrl: profile?.profile_avatar_url ?? null,
      },
      itemCount: items.length,
      covers: items
        .slice(0, ROW_COVERS)
        .map((item) => item.games?.cover_url ?? item.games?.icon_url ?? null),
      likeCount: likeCount.get(list.id) ?? 0,
      isPrivate: list.visibility === "private",
    };
  });
}

/**
 * Perfil › Listas (#197): las listas de un usuario como filas, la última
 * editada primero. Con `publicOnly` (perfil ajeno) se piden sólo las públicas
 * de forma explícita, aunque la RLS ya esconda las privadas: igual que en
 * `getFriendsLists`, no se hereda.
 */
export async function getProfileListRows(
  supabase: Client,
  viewerId: string,
  ownerId: string,
  { publicOnly }: { publicOnly: boolean },
): Promise<ListRowData[]> {
  let query = supabase
    .from("user_lists")
    .select(LIST_ROW_SELECT)
    .eq("user_id", ownerId)
    .order("updated_at", { ascending: false });
  if (publicOnly) query = query.eq("visibility", "public");
  const { data } = await query;
  return toListRows(supabase, viewerId, data ?? [], { keepEmpty: !publicOnly });
}

/**
 * "Nuevas de tus amigos": las listas públicas de la gente que seguís, la más
 * nueva primero. Sólo las públicas aunque la RLS ya lo garantice: acá se pide
 * explícito, no se hereda.
 */
export async function getFriendsLists(
  supabase: Client,
  viewerId: string,
  limit = 10,
): Promise<{ hasFriends: boolean; lists: ListRowData[] }> {
  const { data: friendships } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", viewerId);
  const friendIds = (friendships ?? []).map((row) => row.friend_id);
  if (friendIds.length === 0) return { hasFriends: false, lists: [] };

  const { data } = await supabase
    .from("user_lists")
    .select(LIST_ROW_SELECT)
    .in("user_id", friendIds)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit * 2);

  const lists = (await toListRows(supabase, viewerId, data ?? [])).slice(0, limit);
  return { hasFriends: true, lists };
}

/**
 * "Populares esta semana": las listas públicas con más likes recibidos en los
 * últimos 7 días. Empates: la más nueva primero.
 */
export async function getPopularListsThisWeek(
  supabase: Client,
  viewerId: string,
  limit = 10,
): Promise<ListRowData[]> {
  const since = new Date(Date.now() - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: likes } = await supabase
    .from("list_likes")
    .select("list_id")
    .gte("created_at", since);

  const weekly = new Map<string, number>();
  for (const like of likes ?? []) weekly.set(like.list_id, (weekly.get(like.list_id) ?? 0) + 1);
  if (weekly.size === 0) return [];

  const { data } = await supabase
    .from("user_lists")
    .select(LIST_ROW_SELECT)
    .in("id", [...weekly.keys()])
    .eq("visibility", "public");

  const lists = [...(data ?? [])].sort(
    (a, b) =>
      (weekly.get(b.id) ?? 0) - (weekly.get(a.id) ?? 0) || b.created_at.localeCompare(a.created_at),
  );
  return (await toListRows(supabase, viewerId, lists)).slice(0, limit);
}

/**
 * Listas públicas por título, para la búsqueda (issue #194). Sólo las
 * públicas, pedido explícito: una privada ajena no puede aparecer aunque la
 * RLS ya la esconda, y una privada propia tampoco (es un buscador de
 * descubrir, tus listas están en tu perfil).
 */
export async function searchPublicLists(
  supabase: Client,
  viewerId: string,
  query: string,
  limit = 20,
): Promise<ListRowData[]> {
  // `%` y `_` son comodines de `ilike`: se escapan para buscar el texto literal.
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const { data } = await supabase
    .from("user_lists")
    .select(LIST_ROW_SELECT)
    .eq("visibility", "public")
    .ilike("title", pattern)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return toListRows(supabase, viewerId, data ?? []);
}
