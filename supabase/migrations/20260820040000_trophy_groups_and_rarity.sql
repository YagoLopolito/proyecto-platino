-- Progreso por DLC/expansión (grupos de trofeos) + rareza/progreso por trofeo.
-- Mismo patrón que `trophies`: catálogo compartido, lectura pública, escritura
-- solo del autor (sync PSN o carga manual).

create table public.trophy_groups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  group_id text not null,
  name text not null,
  icon_url text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (game_id, group_id)
);

alter table public.trophy_groups enable row level security;

create policy "trophy_groups_select_all"
  on public.trophy_groups for select
  using (true);

create policy "trophy_groups_insert_authenticated"
  on public.trophy_groups for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "trophy_groups_update_own"
  on public.trophy_groups for update
  to authenticated
  using (auth.uid() = created_by);

-- Rareza (0=ultra rara .. 3=común) y % de jugadores que lo desbloqueó, tal
-- cual los expone psn-api (`trophyRare`/`trophyEarnedRate`). `progress_target`
-- es el objetivo de trofeos con contador (ej. "8" coleccionables) -- la API de
-- PSN no expone el progreso *actual* del usuario en ese contador, solo el
-- total a alcanzar.
alter table public.trophies
  add column rarity smallint check (rarity between 0 and 3),
  add column earned_rate numeric(5, 2),
  add column progress_target text;
