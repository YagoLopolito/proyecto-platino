-- Galería online: notificaciones de me gusta y comentarios en tus
-- publicaciones, dentro de Actividad › Recibido.
--
-- Igual que el resto de Actividad (20260928000000_activity_feed.sql), NO hay
-- tabla de notificaciones: Recibido se deriva de las tablas fuente. Borrar un
-- post se lleva en cascada sus likes y comentarios, y con ellos sus
-- notificaciones; nunca hay una notificación que apunte a algo borrado.
--
-- Cambia la forma de lo que devuelve (`post_id`), y eso no se puede hacer con
-- `create or replace`: se dropea y se recrea con la misma definición más los
-- dos tipos nuevos.

drop function if exists public.get_activity_received(timestamptz, text, integer, text[]);

create function public.get_activity_received(
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
  finished_on date,
  post_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from (
    select 'liked_review:' || rl.user_id::text || ':' || rl.entry_id::text, 'liked_review'::text,
      rl.created_at, rl.user_id, e.game_id, null::uuid, e.id, null::numeric, null::date, null::uuid
    from public.review_likes rl
    join public.game_diary_entries e on e.id = rl.entry_id
    where e.user_id = auth.uid() and rl.user_id <> auth.uid()

    union all
    select 'liked_list:' || ll.user_id::text || ':' || ll.list_id::text, 'liked_list',
      ll.created_at, ll.user_id, null, l.id, null, null, null, null
    from public.list_likes ll
    join public.user_lists l on l.id = ll.list_id
    where l.user_id = auth.uid() and ll.user_id <> auth.uid()

    union all
    select 'follow:' || f.user_id::text, 'follow', f.created_at, f.user_id, null,
      null, null, null, null, null
    from public.friendships f
    where f.friend_id = auth.uid()

    -- Galería online: likes y comentarios en tus publicaciones (nunca los tuyos).
    union all
    select 'post_like:' || pl.user_id::text || ':' || pl.post_id::text, 'post_like',
      pl.created_at, pl.user_id, p.game_id, null, null, null, null, p.id
    from public.post_likes pl
    join public.posts p on p.id = pl.post_id
    where p.user_id = auth.uid() and pl.user_id <> auth.uid()

    union all
    select 'post_comment:' || c.id::text, 'post_comment',
      c.created_at, c.user_id, p.game_id, null, null, null, null, p.id
    from public.post_comments c
    join public.posts p on p.id = c.post_id
    where p.user_id = auth.uid() and c.user_id <> auth.uid()
  ) as a (id, kind, occurred_at, actor_id, game_id, list_id, entry_id, rating, finished_on, post_id)
  where (kinds is null or a.kind = any (kinds))
    and (before_at is null or (a.occurred_at, a.id) < (before_at, before_id))
  order by a.occurred_at desc, a.id desc
  limit least(greatest(max_rows, 1), 100);
$$;

revoke all on function public.get_activity_received(timestamptz, text, integer, text[]) from public, anon;
grant execute on function public.get_activity_received(timestamptz, text, integer, text[]) to authenticated;

-- "Recibido" desde la última vez que lo abriste: el globito de Actividad.
alter table public.users add column if not exists activity_seen_at timestamptz;

-- Cuántas cosas recibiste desde que abriste Recibido por última vez. Tope 100
-- (el del RPC): la UI muestra "99+" desde ahí, no hace falta contar más.
create or replace function public.count_unread_received()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.get_activity_received(null, null, 100, null) a
  where a.occurred_at > coalesce(
    (select u.activity_seen_at from public.users u where u.id = auth.uid()),
    '-infinity'::timestamptz
  );
$$;

revoke all on function public.count_unread_received() from public, anon;
grant execute on function public.count_unread_received() to authenticated;

-- Abrir Recibido marca todo como leído. `security invoker`: sólo puede tocar
-- la fila propia (policy `users_update_own`).
create or replace function public.mark_received_seen()
returns void
language sql
volatile
security invoker
set search_path = public
as $$
  update public.users set activity_seen_at = now() where id = auth.uid();
$$;

revoke all on function public.mark_received_seen() from public, anon;
grant execute on function public.mark_received_seen() to authenticated;

-- Para "qué likes recibieron mis posts".
create index if not exists post_likes_post_id_created on public.post_likes (post_id, created_at desc);
create index if not exists posts_user_id on public.posts (user_id);

-- ROLLBACK
-- drop function if exists public.mark_received_seen();
-- drop function if exists public.count_unread_received();
-- alter table public.users drop column if exists activity_seen_at;
-- (y recrear get_activity_received desde 20260928000000_activity_feed.sql)
