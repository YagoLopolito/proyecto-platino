-- Con qué cuenta se muestra el perfil: PSN o Steam (nombre y foto).
--
-- `users.profile_platform` es la preferencia explícita del usuario. NULL =
-- automático: PSN si está conectada, si no Steam. Si la plataforma elegida ya
-- no está conectada, se cae a la otra (nunca a un perfil vacío teniendo una
-- cuenta). La elige el propio usuario en Configuración › Perfil; la RLS
-- `users_update_own` ya existente es la segunda capa.
alter table public.users
  add column if not exists profile_platform text
  constraint users_profile_platform_check check (profile_platform in ('psn', 'steam'));

-- `public_profiles` resuelve la preferencia una sola vez (`profile_platform`,
-- `profile_name`, `profile_avatar_url`) para que ningún caller la reimplemente.
--
-- CUIDADO: SECURITY DEFINER a propósito (ver migración de friends). Las
-- columnas nuevas son derivadas de otras que la vista ya exponía.
-- Se dropea y se recrea; la definición arranca de la de 20260929000000.
drop view if exists public.public_profiles;

create view public.public_profiles as
with resolved as (
  select
    u.*,
    p.online_id as p_online_id,
    p.avatar_url as p_avatar_url,
    p.trophy_level as p_trophy_level,
    p.trophy_progress as p_trophy_progress,
    p.earned_platinum as p_earned_platinum,
    p.earned_gold as p_earned_gold,
    p.earned_silver as p_earned_silver,
    p.earned_bronze as p_earned_bronze,
    s.persona_name as s_persona_name,
    s.avatar_url as s_avatar_url,
    case
      when p.user_id is not null and s.user_id is not null
        then coalesce(u.profile_platform, 'psn')
      when p.user_id is not null then 'psn'
      when s.user_id is not null then 'steam'
    end as effective_platform
  from public.users u
  left join public.psn_accounts p on p.user_id = u.id
  left join public.steam_accounts s on s.user_id = u.id
)
select
  r.id,
  r.display_name,
  r.p_online_id as psn_online_id,
  r.p_avatar_url as avatar_url,
  r.s_persona_name as steam_persona_name,
  r.s_avatar_url as steam_avatar_url,
  r.p_trophy_level as trophy_level,
  r.p_trophy_progress as trophy_progress,
  r.p_earned_platinum as earned_platinum,
  r.p_earned_gold as earned_gold,
  r.p_earned_silver as earned_silver,
  r.p_earned_bronze as earned_bronze,
  r.bio,
  r.effective_platform as profile_platform,
  case r.effective_platform
    when 'steam' then r.s_persona_name
    else r.p_online_id
  end as profile_name,
  case r.effective_platform
    when 'steam' then r.s_avatar_url
    else r.p_avatar_url
  end as profile_avatar_url
from resolved r;

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;
