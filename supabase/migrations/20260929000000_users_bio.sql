-- Perfil › Perfil (epic #183, issue #196): bio corta del usuario.
--
-- 160 caracteres, como la bio de Letterboxd: una línea debajo del avatar, no
-- un texto. El límite está también en `lib/profile/constants.ts`
-- (`MAX_BIO_LENGTH`) y tiene que coincidir con este `check`.
--
-- La escribe el propio usuario desde Configuración › Perfil; la RLS
-- `users_update_own` ya existente es la segunda capa (la Server Action valida
-- el largo y que sea su fila).
alter table public.users
  add column if not exists bio text
  constraint users_bio_length check (char_length(bio) <= 160);

-- La bio es pública (es lo que muestra el perfil de otro usuario), así que va a
-- `public_profiles`.
--
-- CUIDADO: esta vista es SECURITY DEFINER a propósito (ver migración de
-- friends): cada columna nueva expone un dato que la RLS de la tabla de origen
-- no dejaría leer. `bio` es pública por diseño; nunca el email.
--
-- Se dropea y se recrea (no `create or replace`): cambiar la lista de columnas
-- no se puede en caliente. La definición arranca de la de 20260913000000.
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
  p.earned_bronze,
  u.bio
from public.users u
left join public.psn_accounts p on p.user_id = u.id
left join public.steam_accounts s on s.user_id = u.id;

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;
