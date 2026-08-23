-- Fase 13, paso 1: Steam como segunda plataforma conectable.
--
-- Diferencia central con `psn_accounts`: la credencial es la STEAM_API_KEY de
-- la app, no un secreto por usuario. No hay NPSSO, no hay nada que cifrar y
-- nada que expire; el modo de falla es "perfil en privado", no "token vencido".

create table public.steam_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  steam_id64 text not null,
  persona_name text not null,
  avatar_url text,
  -- Equivalente a psn_accounts.token_status: con "Detalles del juego" en
  -- privado, GetOwnedGames/GetPlayerAchievements devuelven vacío con HTTP 200.
  profile_visibility text not null default 'public'
    check (profile_visibility in ('public', 'private')),
  -- Que el usuario tipee un SteamID no prueba que la cuenta sea suya. Queda en
  -- false hasta que exista el login por Steam OpenID (issue aparte).
  verified boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.steam_accounts enable row level security;

create policy "steam_accounts_select_own"
  on public.steam_accounts for select
  using (auth.uid() = user_id);

create policy "steam_accounts_insert_own"
  on public.steam_accounts for insert
  with check (auth.uid() = user_id);

create policy "steam_accounts_update_own"
  on public.steam_accounts for update
  using (auth.uid() = user_id);

create policy "steam_accounts_delete_own"
  on public.steam_accounts for delete
  using (auth.uid() = user_id);

-- Catálogo: un juego de Steam es una fila propia de `games` (un título que está
-- en las dos plataformas son dos filas en v1 -- deduplicar es el mismo problema
-- de matching que lib/catalog/dedup.ts con los remasters).
alter table public.games
  add column if not exists steam_appid integer;

-- Parcial: convive con las filas de PSN/catálogo/manuales, que lo tienen NULL.
create unique index games_steam_appid_key
  on public.games (steam_appid)
  where steam_appid is not null;

alter table public.games
  drop constraint if exists games_source_check;
alter table public.games
  add constraint games_source_check
  check (source in ('manual', 'psn', 'catalog', 'steam'));

-- Los logros de Steam son planos: no hay bronce/plata/oro ni platino. Todo lo
-- que agrupa o colorea por `trophies.type` tiene que tratar 'achievement' como
-- "sin desglose", no como un cuarto color (get_library_trophy_stats ya lo hace:
-- suma en total/obtained y no cae en ninguno de los cuatro `filter`).
alter table public.trophies
  drop constraint if exists trophies_type_check;
alter table public.trophies
  add constraint trophies_type_check
  check (type in ('bronze', 'silver', 'gold', 'platinum', 'achievement'));

-- El directorio de usuarios suma el nombre y avatar de Steam.
--
-- CUIDADO: esta vista es SECURITY DEFINER a propósito (ver migración de
-- friends), así que cada columna que se agregue expone un dato que la RLS de la
-- tabla de origen no dejaría leer. Van SOLO persona_name y avatar_url; el
-- steam_id64 no se expone porque nada de la UI lo necesita.
drop view if exists public.public_profiles;

create view public.public_profiles as
select
  u.id,
  u.display_name,
  p.online_id as psn_online_id,
  p.avatar_url,
  s.persona_name as steam_persona_name,
  s.avatar_url as steam_avatar_url
from public.users u
left join public.psn_accounts p on p.user_id = u.id
left join public.steam_accounts s on s.user_id = u.id;

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;
