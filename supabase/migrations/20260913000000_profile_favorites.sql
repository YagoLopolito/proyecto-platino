-- Top 5 del perfil + perfil público de otro usuario.
--
-- El "Top 5" son los juegos que el usuario elige mostrar en su perfil, en el
-- orden que quiera. Es contenido de presentación, no datos sincronizados: no
-- sale de trofeos ni de horas, lo arma el usuario a mano desde su biblioteca.
create table public.user_favorite_games (
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  -- 1..5: el orden en el que se muestran. `slot` y no `position` porque
  -- `position` es una función de SQL y queda ambigua en queries crudas.
  slot smallint not null check (slot between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (user_id, game_id),
  -- Un juego por casillero: el editor reescribe la lista entera (borra +
  -- inserta), así reordenar no necesita updates encadenados.
  unique (user_id, slot)
);

alter table public.user_favorite_games enable row level security;

-- Público, igual que `game_diary_entries` (ver CLAUDE.md): el perfil de
-- cualquier usuario se puede ver, y el Top 5 es justamente lo que muestra.
create policy "user_favorite_games_select_all"
  on public.user_favorite_games for select
  using (true);

create policy "user_favorite_games_insert_own"
  on public.user_favorite_games for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_favorite_games_update_own"
  on public.user_favorite_games for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_favorite_games_delete_own"
  on public.user_favorite_games for delete
  to authenticated
  using (auth.uid() = user_id);

-- `public_profiles` suma el nivel de trofeos y los totales por tipo que ya
-- informa PSN.
--
-- Sigue siendo SECURITY DEFINER a propósito (ver migración 20260822010000) y
-- sigue listando SOLO columnas públicas: nunca npsso_encrypted, account_id ni
-- el email. El nivel y los totales de trofeos son lo que cualquiera ve en un
-- perfil de PSN, y son lo único que se puede mostrar del perfil de otro
-- usuario: `user_trophies` es privado, así que los números por juego no se
-- pueden derivar desde la sesión del que mira.
--
-- Se redefine entera (arrancando de la versión de 20260823010000, que ya sumaba
-- las columnas de Steam): `create or replace view` no puede cambiar la lista de
-- columnas, así que se dropea y se vuelve a crear.
drop view if exists public.public_profiles;

create view public.public_profiles as
select
  u.id,
  u.display_name,
  p.online_id as psn_online_id,
  p.avatar_url,
  s.persona_name as steam_persona_name,
  s.avatar_url as steam_avatar_url,
  p.trophy_level,
  p.trophy_progress,
  p.earned_platinum,
  p.earned_gold,
  p.earned_silver,
  p.earned_bronze
from public.users u
left join public.psn_accounts p on p.user_id = u.id
left join public.steam_accounts s on s.user_id = u.id;

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;
