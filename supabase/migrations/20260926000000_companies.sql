-- Estudios (epic #183, issue #193): desarrolladoras y publishers de IGDB, con
-- su perfil (`/estudios/[slug]`) y la lista de juegos que hicieron.
--
-- Todo es catálogo público compartido: se lee sin restricciones y lo escribe
-- sólo el service role (`lib/igdb/`, vía `lib/supabase/service.ts`), mismo
-- criterio que `game_external_guides`. Ningún usuario "es dueño" de un estudio.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  igdb_id integer not null unique,
  name text not null,
  slug text not null unique,
  logo_url text,
  description text,
  country text,
  parent_igdb_id integer,
  -- Juegos desarrollados y publicados según IGDB, ya resueltos a nombre,
  -- carátula y año: se muestran aunque no estén en `games`, así que no hay
  -- `game_id` al que apuntar. Forma: {"developed": [...], "published": [...]}.
  games_cache jsonb,
  -- NULL = nunca se pidieron los juegos. Se refrescan cada 30 días.
  games_checked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.companies.parent_igdb_id is
  'Empresa madre en IGDB (Insomniac -> Sony Interactive). Puede no tener fila propia todavía.';
comment on column public.companies.games_cache is
  'Juegos del estudio según IGDB: {developed: [{igdbId, name, coverUrl, year}], published: [...]}.';

create table if not exists public.game_companies (
  game_id uuid not null references public.games (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  role text not null check (role in ('developer', 'publisher', 'porting', 'supporting')),
  primary key (game_id, company_id, role)
);

create index if not exists game_companies_company_idx on public.game_companies (company_id);

alter table public.games
  add column if not exists igdb_id integer,
  add column if not exists companies_checked_at timestamptz;

-- No es unique: el mismo juego puede ser dos filas (PSN y Steam, ver CLAUDE.md).
create index if not exists games_igdb_id_idx on public.games (igdb_id) where igdb_id is not null;

comment on column public.games.igdb_id is
  'Id del juego en IGDB, resuelto por nombre al abrir la ficha. NULL = no se resolvió.';
comment on column public.games.companies_checked_at is
  'Cuándo se consultaron los estudios en IGDB. NULL = nunca, o la consulta falló (no se cachea un fallo).';

alter table public.companies enable row level security;
alter table public.game_companies enable row level security;

create policy "companies_select_all" on public.companies for select using (true);
create policy "game_companies_select_all" on public.game_companies for select using (true);
-- Sin policies de escritura: sólo el service role (que bypassea RLS) escribe.
