-- Catálogo compartido de trofeos por juego. Igual que games: lectura pública, no user-scoped.
create table public.trophies (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  trophy_id text not null,
  name text not null,
  description text,
  type text not null check (type in ('bronze', 'silver', 'gold', 'platinum')),
  icon_url text,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game_id, trophy_id)
);

alter table public.trophies enable row level security;

create policy "trophies_select_all"
  on public.trophies for select
  using (true);
