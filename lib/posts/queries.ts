import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getNowPlaying } from "@/lib/now-playing/queries";
import { sortGamesPlayingFirst } from "./order";
import {
  FEED_COMMENTS_PREVIEW,
  FEED_PAGE_SIZE,
  GRID_PAGE_SIZE,
  POST_MEDIA_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "./constants";
import { pageCount, pageRange } from "./pagination";
import type { PostPerson, PostView, PostsPage } from "./types";
import { dbErrorMessage } from "@/lib/errors";

type Client = SupabaseClient<Database>;

/** Cuántos juegos de tu biblioteca se ofrecen sin buscar (los más recientes). */
const COMPOSER_RECENT_GAMES = 12;

export interface ComposerGame {
  id: string;
  name: string;
  coverUrl: string | null;
  playing: boolean;
}

/**
 * Opciones del selector de juego del compositor: lo que estás jugando
 * primero, después los últimos juegos que abriste. El resto del catálogo se
 * busca en el propio selector.
 */
export async function getComposerGames(supabase: Client, userId: string): Promise<ComposerGame[]> {
  const [playing, { data: recent }] = await Promise.all([
    getNowPlaying(supabase, userId),
    supabase
      .from("user_games")
      .select("last_played_at, games!inner (id, name, cover_url, icon_url)")
      .eq("user_id", userId)
      .order("last_played_at", { ascending: false, nullsFirst: false })
      .limit(COMPOSER_RECENT_GAMES),
  ]);

  return sortGamesPlayingFirst<ComposerGame>(
    playing.map((game) => ({
      id: game.id,
      name: game.name,
      coverUrl: game.imageUrl,
      playing: true,
    })),
    (recent ?? []).flatMap((row) =>
      row.games
        ? [
            {
              id: row.games.id,
              name: row.games.name,
              coverUrl: row.games.cover_url ?? row.games.icon_url,
              playing: false,
            },
          ]
        : [],
    ),
  );
}

/** Un juego por id, para preseleccionarlo (`/publicaciones/nueva?juego=`). */
export async function getComposerGame(
  supabase: Client,
  gameId: string,
): Promise<ComposerGame | null> {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) return null;
  const { data } = await supabase
    .from("games")
    .select("id, name, cover_url, icon_url")
    .eq("id", gameId)
    .maybeSingle();
  return data
    ? { id: data.id, name: data.name, coverUrl: data.cover_url ?? data.icon_url, playing: false }
    : null;
}

// Galería: feed, grilla y detalle -------------------------------------------

type Variant = "feed" | "grid" | "detail";

const POST_COLUMNS = "id, user_id, game_id, caption, is_spoiler, published_at, edited_at";

interface PostRow {
  id: string;
  user_id: string;
  game_id: string;
  caption: string | null;
  is_spoiler: boolean;
  published_at: string | null;
  edited_at: string | null;
}

interface MediaRow {
  id: string;
  post_id: string;
  position: number;
  storage_path: string;
  display_path: string | null;
  poster_path: string | null;
  media_type: string;
  mime_type: string;
  width: number;
  height: number;
  duration_seconds: number | null;
}

async function getPeople(supabase: Client, ids: string[]): Promise<Map<string, PostPerson>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("public_profiles")
    .select("id, display_name, profile_name, profile_avatar_url")
    .in("id", ids);
  return new Map(
    (data ?? []).flatMap((profile) =>
      profile.id
        ? [
            [
              profile.id,
              {
                id: profile.id,
                name: profile.profile_name ?? profile.display_name ?? "Usuario sin nombre",
                avatarUrl: profile.profile_avatar_url,
              },
            ] as const,
          ]
        : [],
    ),
  );
}

/** Paths a firmar de un archivo según dónde se muestra (sin tocar el original en grilla/feed). */
function pathsFor(media: MediaRow, variant: Variant) {
  const isVideo = media.media_type === "video";
  const shown = isVideo
    ? media.poster_path
    : variant === "detail"
      ? media.storage_path
      : (media.display_path ?? media.storage_path);
  return {
    src: shown,
    // El original también en el feed: lo abre la pantalla completa (el feed
    // en sí sigue mostrando el derivado liviano). La grilla no lo necesita.
    original: variant === "grid" ? null : media.storage_path,
    poster: isVideo ? media.poster_path : null,
  };
}

/**
 * Completa las filas de `posts` con todo lo que la UI necesita: archivos con
 * URLs firmadas, autor, juego, contadores (`get_post_stats`) y comentarios.
 * Un número fijo de consultas por página, no una por post.
 */
async function hydratePosts(
  supabase: Client,
  viewerId: string,
  rows: PostRow[],
  variant: Variant,
): Promise<PostView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const gameIds = [...new Set(rows.map((row) => row.game_id))];

  const [{ data: media }, { data: games }, { data: stats }, { data: comments }] = await Promise.all(
    [
      supabase
        .from("post_media")
        .select(
          "id, post_id, position, storage_path, display_path, poster_path, media_type, mime_type, width, height, duration_seconds",
        )
        .in("post_id", ids)
        // La grilla sólo muestra la portada (pero necesita saber si hay más).
        .order("position", { ascending: true }),
      supabase.from("games").select("id, name, cover_url, icon_url").in("id", gameIds),
      supabase.rpc("get_post_stats", { post_ids: ids }),
      variant === "grid"
        ? Promise.resolve({
            data: [] as {
              id: string;
              post_id: string;
              user_id: string;
              body: string;
              created_at: string;
            }[],
          })
        : supabase
            .from("post_comments")
            .select("id, post_id, user_id, body, created_at")
            .in("post_id", ids)
            .order("created_at", { ascending: false })
            // En el feed alcanza con los últimos de cada post; el tope evita
            // traer miles de comentarios de una página de 30 posts.
            .limit(variant === "detail" ? 1000 : ids.length * FEED_COMMENTS_PREVIEW * 5),
    ],
  );

  const mediaByPost = new Map<string, MediaRow[]>();
  for (const item of (media ?? []) as MediaRow[]) {
    mediaByPost.set(item.post_id, [...(mediaByPost.get(item.post_id) ?? []), item]);
  }
  const commentsByPost = new Map<string, NonNullable<typeof comments>>();
  for (const comment of comments ?? []) {
    const list = commentsByPost.get(comment.post_id) ?? [];
    if (variant === "detail" || list.length < FEED_COMMENTS_PREVIEW) list.push(comment);
    commentsByPost.set(comment.post_id, list);
  }

  const people = await getPeople(supabase, [
    ...new Set([...rows.map((row) => row.user_id), ...(comments ?? []).map((c) => c.user_id)]),
  ]);

  // Firmar todo junto: una sola llamada a Storage por página.
  const toSign = new Set<string>();
  for (const row of rows) {
    const list = mediaByPost.get(row.id) ?? [];
    for (const item of variant === "grid" ? list.slice(0, 1) : list) {
      const paths = pathsFor(item, variant);
      for (const path of [paths.src, paths.original, paths.poster]) if (path) toSign.add(path);
    }
  }
  const signed = new Map<string, string>();
  if (toSign.size > 0) {
    const { data: urls } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrls([...toSign], SIGNED_URL_TTL_SECONDS);
    for (const entry of urls ?? []) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }
  const url = (path: string | null) => (path ? (signed.get(path) ?? null) : null);

  const gamesById = new Map((games ?? []).map((game) => [game.id, game]));
  const statsById = new Map((stats ?? []).map((row) => [row.post_id, row]));
  const unknown = (id: string): PostPerson => ({ id, name: "Usuario sin nombre", avatarUrl: null });

  return rows.flatMap((row) => {
    const game = gamesById.get(row.game_id);
    const items = mediaByPost.get(row.id) ?? [];
    if (!game || items.length === 0 || !row.published_at) return [];
    const stat = statsById.get(row.id);
    const isOwn = row.user_id === viewerId;
    return {
      id: row.id,
      caption: row.caption,
      isSpoiler: row.is_spoiler,
      publishedAt: row.published_at,
      editedAt: row.edited_at,
      isOwn,
      author: people.get(row.user_id) ?? unknown(row.user_id),
      game: { id: game.id, name: game.name, coverUrl: game.cover_url ?? game.icon_url },
      media: items.map((item, index) => {
        const paths = pathsFor(item, variant);
        const shouldSign = variant !== "grid" || index === 0;
        return {
          id: item.id,
          position: item.position,
          kind: item.media_type === "video" ? "video" : "image",
          mimeType: item.mime_type,
          width: item.width,
          height: item.height,
          durationSeconds: item.duration_seconds,
          src: shouldSign ? url(paths.src) : null,
          originalSrc: shouldSign ? url(paths.original) : null,
          posterSrc: shouldSign ? url(paths.poster) : null,
        };
      }),
      likeCount: stat?.like_count ?? 0,
      commentCount: stat?.comment_count ?? 0,
      likedByMe: stat?.liked_by_me ?? false,
      comments: [...(commentsByPost.get(row.id) ?? [])].reverse().map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.created_at,
        author: people.get(comment.user_id) ?? unknown(comment.user_id),
        canDelete: comment.user_id === viewerId || isOwn,
      })),
    } satisfies PostView;
  });
}

type PostsFilter = { userIds: string[] } | { gameId: string } | { userId: string };

async function listPosts(
  supabase: Client,
  viewerId: string,
  filter: PostsFilter,
  page: number,
  pageSize: number,
  variant: Variant,
): Promise<PostsPage> {
  const { from, to } = pageRange(page, pageSize);
  let query = supabase
    .from("posts")
    .select(POST_COLUMNS, { count: "exact" })
    .eq("status", "published");
  if ("userIds" in filter) query = query.in("user_id", filter.userIds);
  else if ("gameId" in filter) query = query.eq("game_id", filter.gameId);
  else query = query.eq("user_id", filter.userId);

  const { data, error, count } = await query
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  // Una página más allá del final: PostgREST responde 416 (PGRST103) SIN el
  // `count`, que es justo lo que hace falta para redirigir a la última página.
  // Se cuenta aparte, sólo en ese caso.
  if (error && error.code !== "PGRST103")
    return { status: "error", message: dbErrorMessage("posts.queries", error) };
  let total = count ?? 0;
  if (error) {
    let countQuery = supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "published");
    if ("userIds" in filter) countQuery = countQuery.in("user_id", filter.userIds);
    else if ("gameId" in filter) countQuery = countQuery.eq("game_id", filter.gameId);
    else countQuery = countQuery.eq("user_id", filter.userId);
    const { count: fullCount, error: countError } = await countQuery;
    if (countError)
      return { status: "error", message: dbErrorMessage("posts.queries", countError) };
    total = fullCount ?? 0;
  }
  return {
    status: "ok",
    posts: error ? [] : await hydratePosts(supabase, viewerId, (data ?? []) as PostRow[], variant),
    total,
    page,
    pageCount: pageCount(total, pageSize),
  };
}

/**
 * Galería online (Actividad): tus publicaciones y las de la gente que seguís
 * (`friendships` es unidireccional: "amigos" = a quién seguís vos).
 */
export async function getGalleryFeedPage(supabase: Client, viewerId: string, page: number) {
  const { data: follows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", viewerId);
  const userIds = [viewerId, ...(follows ?? []).map((row) => row.friend_id)];
  return listPosts(supabase, viewerId, { userIds }, page, FEED_PAGE_SIZE, "feed");
}

/** Capturas de un juego: las de todos los usuarios. */
export async function getGamePostsPage(
  supabase: Client,
  viewerId: string,
  gameId: string,
  page: number,
) {
  return listPosts(supabase, viewerId, { gameId }, page, GRID_PAGE_SIZE, "grid");
}

/** Publicaciones de un usuario (grilla de su perfil). */
export async function getUserPostsPage(
  supabase: Client,
  viewerId: string,
  userId: string,
  page: number,
) {
  return listPosts(supabase, viewerId, { userId }, page, GRID_PAGE_SIZE, "grid");
}

/** Una publicación con todos sus comentarios y los originales firmados. */
export async function getPost(
  supabase: Client,
  viewerId: string,
  postId: string,
): Promise<PostView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const { data } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return null;
  const [post] = await hydratePosts(supabase, viewerId, [data as PostRow], "detail");
  return post ?? null;
}
