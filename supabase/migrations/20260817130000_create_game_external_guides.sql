-- Enlaces a guías externas curadas automáticamente por juego (Steam Web API
-- oficial + búsqueda con IA para PowerPyx/PSNProfiles/TrueTrophies). No son
-- contenido de usuario: se pueblan server-side con el cliente service-role,
-- así que no llevan author_id ni policies de insert/update/delete para
-- usuarios autenticados -- solo lectura pública.
create table public.game_external_guides (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  title text not null,
  url text not null,
  source text not null,
  source_type text not null check (source_type in ('steam_api', 'ai_search')),
  created_at timestamptz not null default now(),
  unique (game_id, url)
);

alter table public.game_external_guides enable row level security;

create policy "game_external_guides_select_all"
  on public.game_external_guides for select
  using (true);

create index game_external_guides_game_id_idx on public.game_external_guides (game_id);
