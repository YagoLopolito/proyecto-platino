-- Amigos: seguir a otros usuarios para ver su diario ("Jugados por amigos").
--
-- Es unidireccional y sin aceptación (más parecido a "seguir" que a una
-- solicitud de amistad): el diario ya es público (ver game_diary_entries), así
-- que agregar a alguien no le da acceso a nada que no fuera visible; solo
-- decide qué aparece en tu feed.
create table public.friendships (
  user_id uuid not null references public.users(id) on delete cascade,
  friend_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_no_self check (user_id <> friend_id)
);

alter table public.friendships enable row level security;

create index friendships_friend_id_idx on public.friendships (friend_id);

-- Cada uno ve (y maneja) su propia lista. También puede ver las filas donde es
-- el agregado, para saber quién lo tiene agregado.
create policy "friendships_select_involved"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "friendships_insert_own"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "friendships_delete_own"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id);

-- Directorio de usuarios para el buscador de "Agregar amigo".
--
-- SECURITY DEFINER a propósito (sin security_invoker, a diferencia de
-- game_scores/get_library_trophy_stats): expone el online_id y el avatar de
-- psn_accounts, cuya RLS es "solo el dueño". La vista lista SOLO columnas
-- públicas -- nunca npsso_encrypted, account_id ni el email -- y se otorga
-- únicamente a usuarios autenticados.
create view public.public_profiles as
select
  u.id,
  u.display_name,
  p.online_id as psn_online_id,
  p.avatar_url
from public.users u
left join public.psn_accounts p on p.user_id = u.id;

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;
