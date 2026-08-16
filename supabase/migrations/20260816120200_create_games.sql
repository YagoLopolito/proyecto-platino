-- Catálogo compartido de juegos. No es user-scoped: RLS de solo-lectura pública,
-- las escrituras quedan reservadas al service role (usado desde el sync server-side).
create table public.games (
  id uuid primary key default gen_random_uuid(),
  np_comm_id text not null unique,
  name text not null,
  platform text,
  icon_url text,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;

create policy "games_select_all"
  on public.games for select
  using (true);
