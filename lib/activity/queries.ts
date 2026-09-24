import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  decodeActivityCursor,
  encodeActivityCursor,
  kindsForFilter,
  type ActivityKind,
  type ActivityTab,
} from "@/lib/activity/format";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Eventos por página (issue #195). */
export const ACTIVITY_PAGE_SIZE = 30;

const RPC = {
  amigos: "get_activity_friends",
  vos: "get_activity_self",
  recibido: "get_activity_received",
} as const;

export interface ActivityPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Un evento del log, con los nombres ya resueltos para armar la frase. */
export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  occurredAt: string;
  actor: ActivityPerson;
  game: { id: string; name: string } | null;
  list: { id: string; title: string } | null;
  entryId: string | null;
  rating: number | null;
  finishedOn: string | null;
}

export type ActivityPage =
  | { status: "ok"; events: ActivityEvent[]; nextCursor: string | null }
  | { status: "error"; message: string };

/**
 * Una página de Actividad (epic #183, issue #195). El RPC deriva el log de las
 * tablas fuente; acá sólo se resuelven nombres (juegos, listas, perfiles) en
 * tres consultas por página, no una por fila.
 */
export async function getActivityPage(
  supabase: SupabaseServerClient,
  tab: ActivityTab,
  rawCursor: string | null = null,
  tipo: string | null = null,
  limit = ACTIVITY_PAGE_SIZE,
): Promise<ActivityPage> {
  const cursor = decodeActivityCursor(rawCursor);
  const kinds = kindsForFilter(tab, tipo);

  const { data, error } = await supabase.rpc(RPC[tab], {
    // Uno de más para saber si hay otra página sin pedir un `count`.
    max_rows: limit + 1,
    ...(cursor ? { before_at: cursor.occurredAt, before_id: cursor.id } : {}),
    ...(kinds ? { kinds } : {}),
  });
  if (error) return { status: "error", message: error.message };

  const rows = (data ?? []).slice(0, limit);
  const last = rows.at(-1);
  const nextCursor =
    (data ?? []).length > limit && last
      ? encodeActivityCursor({ occurredAt: last.occurred_at, id: last.id })
      : null;

  const unique = (values: (string | null)[]) => [
    ...new Set(values.filter((v): v is string => v !== null)),
  ];
  const gameIds = unique(rows.map((row) => row.game_id));
  const listIds = unique(rows.map((row) => row.list_id));
  const actorIds = unique(rows.map((row) => row.actor_id));

  const [games, lists, profiles] = await Promise.all([
    gameIds.length
      ? supabase.from("games").select("id, name").in("id", gameIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    listIds.length
      ? supabase.from("user_lists").select("id, title").in("id", listIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    actorIds.length
      ? supabase
          .from("public_profiles")
          .select("id, display_name, psn_online_id, avatar_url")
          .in("id", actorIds)
      : Promise.resolve({
          data: [] as {
            id: string | null;
            display_name: string | null;
            psn_online_id: string | null;
            avatar_url: string | null;
          }[],
        }),
  ]);

  const gamesById = new Map((games.data ?? []).map((game) => [game.id, game]));
  const listsById = new Map((lists.data ?? []).map((list) => [list.id, list]));
  const peopleById = new Map(
    (profiles.data ?? []).flatMap((profile) =>
      profile.id
        ? [
            [
              profile.id,
              {
                id: profile.id,
                name: profile.psn_online_id ?? profile.display_name ?? "Usuario sin nombre",
                avatarUrl: profile.avatar_url,
              },
            ] as const,
          ]
        : [],
    ),
  );

  return {
    status: "ok",
    nextCursor,
    events: rows.flatMap((row) => {
      const game = row.game_id ? gamesById.get(row.game_id) : undefined;
      const list = row.list_id ? listsById.get(row.list_id) : undefined;
      // Si el juego o la lista no llegó (una lista privada ajena, por RLS),
      // la frase quedaría coja: la fila no se muestra.
      if (row.game_id && !game) return [];
      if (row.list_id && !list) return [];
      return {
        id: row.id,
        kind: row.kind as ActivityKind,
        occurredAt: row.occurred_at,
        actor: peopleById.get(row.actor_id) ?? {
          id: row.actor_id,
          name: "Usuario sin nombre",
          avatarUrl: null,
        },
        game: game ? { id: game.id, name: game.name } : null,
        list: list ? { id: list.id, title: list.title } : null,
        entryId: row.entry_id,
        rating: row.rating,
        finishedOn: row.finished_on,
      };
    }),
  };
}
