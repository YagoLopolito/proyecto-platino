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
    .select("display_name, psn_online_id, avatar_url")
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
      name: author?.psn_online_id ?? author?.display_name ?? "Usuario sin nombre",
      avatarUrl: author?.avatar_url ?? null,
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
  if (gameIds.length === 0) return 0;
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
  return played.size;
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
