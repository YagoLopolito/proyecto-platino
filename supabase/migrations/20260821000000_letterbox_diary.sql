-- Letterbox: diario de partidas terminadas (rating 1-10, público) + soporte para
-- juegos de catálogo externo (RAWG) que todavía no fueron sincronizados vía PSN.

alter table public.games drop constraint if exists games_source_check;
alter table public.games
  add constraint games_source_check check (source in ('manual', 'psn', 'catalog'));
alter table public.games
  add column if not exists external_catalog_id text;

create table public.game_diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  playthrough_number integer not null default 1,
  rating numeric(3, 1) check (rating is null or (rating >= 0 and rating <= 10)),
  review text,
  finished_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id, playthrough_number)
);

alter table public.game_diary_entries enable row level security;

create index game_diary_entries_user_id_idx on public.game_diary_entries (user_id);
create index game_diary_entries_game_id_idx on public.game_diary_entries (game_id);

-- Público a diferencia de user_trophies -- decisión de producto, ver CLAUDE.md.
create policy "game_diary_entries_select_all"
  on public.game_diary_entries for select
  using (true);

create policy "game_diary_entries_insert_own"
  on public.game_diary_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "game_diary_entries_update_own"
  on public.game_diary_entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "game_diary_entries_delete_own"
  on public.game_diary_entries for delete
  to authenticated
  using (auth.uid() = user_id);

-- Promedio del ÚLTIMO rating de cada usuario por juego (no de todas las rejugadas).
create or replace view public.game_scores as
with latest_entry as (
  select distinct on (game_id, user_id) game_id, user_id, rating
  from public.game_diary_entries
  where rating is not null
  order by game_id, user_id, playthrough_number desc
)
select
  game_id,
  avg(rating)::numeric(3, 2) as average_rating,
  count(*) as rating_count
from latest_entry
group by game_id;

grant select on public.game_scores to authenticated;
