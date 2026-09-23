-- Listas pregeneradas (epic #183, issue #192): las listas que arma Platinoob
-- con datos, sin curación manual. Acá viven sólo las que no dependen de quién
-- mira ("Mejor puntuados", "Los más jugados", "Lo mejor de 2023"…); las
-- personalizadas ("Populares entre tus amigos", "Tu Playlist más corta") se
-- calculan al vuelo en `lib/lists/system.ts`.
--
-- La tabla guarda sólo el slug: el título y la descripción viven en
-- `lib/lists/system-catalog.ts`, en un solo lugar.
create table public.system_lists (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  -- Sólo en las listas "Lo mejor de <año>".
  release_year integer,
  -- Cuántos juegos quedaron al calcularla. La tab muestra sólo las primeras
  -- carátulas y no puede contar filas: PostgREST corta en 1000 por request.
  item_count integer not null default 0,
  refreshed_at timestamptz not null default now()
);

create table public.system_list_items (
  list_slug text not null references public.system_lists(slug) on delete cascade,
  -- Borrar un juego (p. ej. los `[E2E]` del teardown) lo saca de la lista.
  game_id uuid not null references public.games(id) on delete cascade,
  position integer not null check (position >= 1),
  primary key (list_slug, game_id),
  unique (list_slug, position)
);

alter table public.system_lists enable row level security;
alter table public.system_list_items enable row level security;

-- Las lee cualquier usuario logueado. No hay policies de escritura: sólo las
-- escribe `refresh_system_lists()`, que corre con el service role desde el cron.
create policy "system_lists_select_authenticated"
  on public.system_lists for select
  to authenticated
  using (true);

create policy "system_list_items_select_authenticated"
  on public.system_list_items for select
  to authenticated
  using (true);

-- Recalcula todas las listas no personalizadas en una sola transacción: quien
-- lea en el medio ve las viejas o las nuevas, nunca una mezcla ni un vacío.
--
-- `p_min_ratings` es `MIN_RATINGS_FOR_AVERAGE` (el mismo umbral del score de
-- la ficha), `p_min_items` el mínimo para que una lista exista y `p_max_items`
-- el tope de juegos por lista. Vienen del código para no duplicar constantes.
--
-- "Jugado" es la definición del epic: platino (PSN), 100% (Steam) o una
-- entrada en el diario, sin contar dos veces el mismo usuario. Lee
-- `user_trophies` de todos, pero sólo expone conteos por juego, nunca quién.
create or replace function public.refresh_system_lists(
  p_min_ratings integer,
  p_min_items integer,
  p_max_items integer
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  lists_count integer;
begin
  drop table if exists pg_temp.system_list_rows;
  create temp table system_list_rows on commit drop as
  with scores as (
    select gs.game_id, gs.average_rating, gs.rating_count, g.name, g.release_year
    from public.game_scores gs
    join public.games g on g.id = gs.game_id
    where gs.rating_count >= p_min_ratings
  ),
  trophy_totals as (
    select game_id, count(*) as total from public.trophies group by game_id
  ),
  steam_completed as (
    select ut.user_id, t.game_id
    from public.user_trophies ut
    join public.trophies t on t.id = ut.trophy_id
    join public.games g on g.id = t.game_id and g.source = 'steam'
    group by ut.user_id, t.game_id
    having count(*) = (select tt.total from trophy_totals tt where tt.game_id = t.game_id)
  ),
  played as (
    select ut.user_id, t.game_id
    from public.user_trophies ut
    join public.trophies t on t.id = ut.trophy_id and t.type = 'platinum'
    union
    select user_id, game_id from steam_completed
    union
    select user_id, game_id from public.game_diary_entries
  ),
  players as (
    select game_id, count(*) as n from played group by game_id
  ),
  with_platinum as (
    select distinct game_id from public.trophies where type = 'platinum'
  ),
  ranked as (
    select 'mejor-puntuados'::text as slug, null::integer as release_year, game_id,
      row_number() over (order by average_rating desc, rating_count desc, name) as position
    from scores
    union all
    -- Con un solo jugador no es "lo más jugado", es lo que jugó alguien.
    select 'mas-jugados', null, p.game_id,
      row_number() over (order by p.n desc, g.name)
    from players p
    join public.games g on g.id = p.game_id
    where p.n >= 2
    union all
    select 'platinos-fin-de-semana', null, g.id,
      row_number() over (order by g.time_to_complete_minutes, g.name)
    from public.games g
    join with_platinum wp on wp.game_id = g.id
    where g.time_to_complete_minutes between 1 and 15 * 60
    union all
    select 'maratones', null, g.id,
      row_number() over (order by g.time_to_complete_minutes desc, g.name)
    from public.games g
    join with_platinum wp on wp.game_id = g.id
    where g.time_to_complete_minutes >= 100 * 60
    union all
    select 'mejor-de-' || release_year, release_year, game_id,
      row_number() over (
        partition by release_year
        order by average_rating desc, rating_count desc, name
      )
    from scores
    where release_year is not null
  )
  select r.slug, r.release_year, r.game_id, r.position::integer as position
  from ranked r
  where r.position <= p_max_items
    and r.slug in (
      select slug from ranked where position <= p_max_items
      group by slug having count(*) >= p_min_items
    );

  -- `where true`: pg-safeupdate rechaza un delete sin where en las requests de PostgREST.
  delete from public.system_lists where true;

  insert into public.system_lists (slug, release_year, item_count)
  select slug, release_year, count(*) from system_list_rows group by slug, release_year;

  insert into public.system_list_items (list_slug, game_id, position)
  select slug, game_id, position from system_list_rows;

  select count(*) into lists_count from public.system_lists;
  return lists_count;
end;
$$;

-- Sólo el service role (el cron). Supabase le da execute a anon/authenticated
-- por defecto a cada función nueva.
revoke execute on function public.refresh_system_lists(integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.refresh_system_lists(integer, integer, integer)
  to service_role;
