-- Actividad (epic #183, issue #195): Amigos / Vos / Recibido.
--
-- Sin tabla de eventos: cada tab es un RPC que deriva el log con `union all`
-- sobre las tablas fuente. Así el log no puede divergir de los datos y borrar
-- algo lo saca del log. Si el de amigos se vuelve lento con datos reales, recién
-- ahí evaluar una tabla `activity_events` con triggers.
--
-- `security invoker` + `auth.uid()`, como `get_library_trophy_stats`: las RLS
-- de cada tabla siguen mandando. En particular, `user_trophies` sólo devuelve
-- las filas propias, así que un platino **nunca** puede aparecer en el feed de
-- otro usuario aunque alguien cambie el RPC de amigos por error.
--
-- Todas devuelven la misma forma. `id` es `<kind>:<clave>` (texto) para que el
-- cursor `(occurred_at, id)` tenga un orden total aunque dos eventos de tablas
-- distintas caigan en el mismo instante.
--
-- `kinds` filtra por tipo (`?tipo=` de la UI); null = todos.

-- Índices `(user_id, <fecha> desc)` que faltaban en las tablas fuente.
create index if not exists game_diary_entries_user_created
  on public.game_diary_entries (user_id, created_at desc);
create index if not exists now_playing_user_started
  on public.now_playing (user_id, started_at desc);
create index if not exists user_playlist_user_added
  on public.user_playlist (user_id, added_at desc);
create index if not exists review_likes_user_created
  on public.review_likes (user_id, created_at desc);
create index if not exists list_likes_user_created
  on public.list_likes (user_id, created_at desc);
create index if not exists friendships_friend_created
  on public.friendships (friend_id, created_at desc);

-- Una entrada que creó el sync (platino / 100%) sin que el usuario la puntuara
-- ni reseñara no es algo que "registró": en Vos ya está el evento de platino, y
-- en Amigos sería filtrar un platino ajeno por la puerta de atrás.
create or replace function public.activity_is_user_entry(e public.game_diary_entries)
returns boolean
language sql
immutable
as $$
  select e.source = 'manual' or e.rating is not null or coalesce(btrim(e.review), '') <> '';
$$;

create or replace function public.get_activity_friends(
  before_at timestamptz default null,
  before_id text default null,
  max_rows integer default 30,
  kinds text[] default null
)
returns table (
  id text,
  kind text,
  occurred_at timestamptz,
  actor_id uuid,
  game_id uuid,
  list_id uuid,
  entry_id uuid,
  rating numeric,
  finished_on date
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from (
    select
      'diary:' || e.id::text,
      'diary'::text,
      e.created_at,
      e.user_id,
      e.game_id,
      null::uuid,
      e.id,
      e.rating,
      e.finished_on
    from public.game_diary_entries e
    join public.friendships f on f.friend_id = e.user_id and f.user_id = auth.uid()
    where public.activity_is_user_entry(e)
  ) as a (id, kind, occurred_at, actor_id, game_id, list_id, entry_id, rating, finished_on)
  where (kinds is null or a.kind = any (kinds))
    and (before_at is null or (a.occurred_at, a.id) < (before_at, before_id))
  order by a.occurred_at desc, a.id desc
  limit least(greatest(max_rows, 1), 100);
$$;

create or replace function public.get_activity_self(
  before_at timestamptz default null,
  before_id text default null,
  max_rows integer default 30,
  kinds text[] default null
)
returns table (
  id text,
  kind text,
  occurred_at timestamptz,
  actor_id uuid,
  game_id uuid,
  list_id uuid,
  entry_id uuid,
  rating numeric,
  finished_on date
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from (
    select 'diary:' || e.id::text, 'diary'::text, e.created_at, e.user_id, e.game_id,
      null::uuid, e.id, e.rating, e.finished_on
    from public.game_diary_entries e
    where e.user_id = auth.uid() and public.activity_is_user_entry(e)

    union all
    -- Platinos: de `user_trophies` (privado, RLS "sólo el dueño").
    select 'platinum:' || ut.id::text, 'platinum', ut.unlocked_at, ut.user_id, t.game_id,
      null, null, null, null
    from public.user_trophies ut
    join public.trophies t on t.id = ut.trophy_id
    where ut.user_id = auth.uid() and t.type = 'platinum' and ut.unlocked_at is not null

    union all
    -- 100% de Steam: el equivalente del platino, desde el diario.
    select 'completion:' || e.id::text, 'completion', e.completed_at, e.user_id, e.game_id,
      null, e.id, null, null
    from public.game_diary_entries e
    where e.user_id = auth.uid() and e.completed_at is not null

    union all
    select 'playing:' || np.id::text, 'playing', np.started_at, np.user_id, np.game_id,
      null, null, null, null
    from public.now_playing np
    where np.user_id = auth.uid()

    union all
    select 'playlist:' || p.game_id::text, 'playlist', p.added_at, p.user_id, p.game_id,
      null, null, null, null
    from public.user_playlist p
    where p.user_id = auth.uid()

    union all
    select 'list_created:' || l.id::text, 'list_created', l.created_at, l.user_id, null,
      l.id, null, null, null
    from public.user_lists l
    where l.user_id = auth.uid()

    union all
    -- "Actualizaste" sólo si la edición fue claramente posterior a crearla:
    -- `saveList` toca `updated_at` en el mismo guardado que la crea.
    select 'list_updated:' || l.id::text, 'list_updated', l.updated_at, l.user_id, null,
      l.id, null, null, null
    from public.user_lists l
    where l.user_id = auth.uid() and l.updated_at > l.created_at + interval '1 minute'

    union all
    select 'like_review:' || rl.entry_id::text, 'like_review', rl.created_at, e.user_id,
      e.game_id, null, e.id, null, null
    from public.review_likes rl
    join public.game_diary_entries e on e.id = rl.entry_id
    where rl.user_id = auth.uid()

    union all
    select 'like_list:' || ll.list_id::text, 'like_list', ll.created_at, l.user_id, null,
      l.id, null, null, null
    from public.list_likes ll
    join public.user_lists l on l.id = ll.list_id
    where ll.user_id = auth.uid()
  ) as a (id, kind, occurred_at, actor_id, game_id, list_id, entry_id, rating, finished_on)
  where (kinds is null or a.kind = any (kinds))
    and (before_at is null or (a.occurred_at, a.id) < (before_at, before_id))
  order by a.occurred_at desc, a.id desc
  limit least(greatest(max_rows, 1), 100);
$$;

create or replace function public.get_activity_received(
  before_at timestamptz default null,
  before_id text default null,
  max_rows integer default 30,
  kinds text[] default null
)
returns table (
  id text,
  kind text,
  occurred_at timestamptz,
  actor_id uuid,
  game_id uuid,
  list_id uuid,
  entry_id uuid,
  rating numeric,
  finished_on date
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from (
    select 'liked_review:' || rl.user_id::text || ':' || rl.entry_id::text, 'liked_review'::text,
      rl.created_at, rl.user_id, e.game_id, null::uuid, e.id, null::numeric, null::date
    from public.review_likes rl
    join public.game_diary_entries e on e.id = rl.entry_id
    where e.user_id = auth.uid() and rl.user_id <> auth.uid()

    union all
    select 'liked_list:' || ll.user_id::text || ':' || ll.list_id::text, 'liked_list',
      ll.created_at, ll.user_id, null, l.id, null, null, null
    from public.list_likes ll
    join public.user_lists l on l.id = ll.list_id
    where l.user_id = auth.uid() and ll.user_id <> auth.uid()

    union all
    select 'follow:' || f.user_id::text, 'follow', f.created_at, f.user_id, null,
      null, null, null, null
    from public.friendships f
    where f.friend_id = auth.uid()
  ) as a (id, kind, occurred_at, actor_id, game_id, list_id, entry_id, rating, finished_on)
  where (kinds is null or a.kind = any (kinds))
    and (before_at is null or (a.occurred_at, a.id) < (before_at, before_id))
  order by a.occurred_at desc, a.id desc
  limit least(greatest(max_rows, 1), 100);
$$;

revoke all on function public.get_activity_friends(timestamptz, text, integer, text[]) from public, anon;
revoke all on function public.get_activity_self(timestamptz, text, integer, text[]) from public, anon;
revoke all on function public.get_activity_received(timestamptz, text, integer, text[]) from public, anon;
grant execute on function public.get_activity_friends(timestamptz, text, integer, text[]) to authenticated;
grant execute on function public.get_activity_self(timestamptz, text, integer, text[]) to authenticated;
grant execute on function public.get_activity_received(timestamptz, text, integer, text[]) to authenticated;
