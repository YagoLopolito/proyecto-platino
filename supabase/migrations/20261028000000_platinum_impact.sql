-- Impacto del platino: celebración de platinos nuevos, vitrina, posts de
-- platino en la Galería online y preferencias de efectos y sonido.

-- 1. Celebración ----------------------------------------------------------------
--
-- `celebrated_at` NULL = platino nuevo que el usuario todavía no vio celebrado.
-- El default es `now()` a propósito: todas las filas que ya existen (y todo
-- trofeo que no sea un platino recién conseguido) nacen "ya celebradas". Sin
-- eso, el primer sync de una biblioteca real encolaba decenas de celebraciones
-- de platinos de hace años. Sólo el sync de PSN la pone en NULL, para un
-- platino nuevo y reciente (ver `shouldCelebratePlatinum` en
-- `lib/platinum/celebration.ts`). Marcarla como vista usa la policy
-- `user_trophies_update_own` que ya existe.
alter table public.user_trophies
  add column celebrated_at timestamptz default now();

create index user_trophies_uncelebrated
  on public.user_trophies (user_id)
  where celebrated_at is null;

-- 2. Colección de platinos ------------------------------------------------------
--
-- Una fila por platino del usuario que mira, de la primera a la última, con lo
-- que necesitan la vitrina y la celebración: número en la colección, rareza
-- (`earned_rate` de PSN) y el primer trofeo de ese juego (para "cuánto
-- tardaste"). `security invoker` + `auth.uid()`: respeta la RLS de
-- `user_trophies` (privada), igual que `get_library_trophy_stats()`.
create or replace function public.get_platinum_collection()
returns table (
  user_trophy_id uuid,
  game_id uuid,
  name text,
  cover_url text,
  icon_url text,
  unlocked_at timestamptz,
  earned_rate numeric,
  first_unlocked_at timestamptz,
  platinum_number integer,
  celebrated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with platinums as (
    -- Un juego tiene un solo platino; `distinct on` por si un sync viejo dejó
    -- una fila repetida.
    select distinct on (t.game_id)
      ut.id, t.game_id, ut.unlocked_at, t.earned_rate, ut.celebrated_at
    from public.user_trophies ut
    join public.trophies t on t.id = ut.trophy_id
    where ut.user_id = auth.uid()
      and t.type = 'platinum'
      and ut.unlocked_at is not null
    order by t.game_id, ut.unlocked_at
  )
  select
    p.id,
    p.game_id,
    g.name,
    g.cover_url,
    g.icon_url,
    p.unlocked_at,
    p.earned_rate,
    (
      select min(ut2.unlocked_at)
      from public.user_trophies ut2
      join public.trophies t2 on t2.id = ut2.trophy_id
      where ut2.user_id = auth.uid()
        and t2.game_id = p.game_id
        and ut2.unlocked_at is not null
    ),
    (row_number() over (order by p.unlocked_at, p.game_id))::integer,
    p.celebrated_at
  from platinums p
  join public.games g on g.id = p.game_id
  order by p.unlocked_at, p.game_id;
$$;

revoke all on function public.get_platinum_collection() from public, anon;
grant execute on function public.get_platinum_collection() to authenticated;

-- 3. Posts de platino -----------------------------------------------------------
--
-- La card "¡Platiné X!" se publica por el mismo flujo que cualquier foto, con
-- `kind = 'platinum'` para que el feed la distinga. Doble capa: la Server
-- Action lo valida y este trigger también, así nadie le pone el borde de
-- platino a una foto de un juego que no platinó. Una vez creado, el tipo no
-- cambia.
alter table public.posts
  add column kind text not null default 'photo' check (kind in ('photo', 'platinum'));

create or replace function public.posts_guard_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.kind <> old.kind then
      raise exception 'No se puede cambiar el tipo de una publicación.';
    end if;
    return new;
  end if;

  if new.kind = 'platinum' and not exists (
    select 1
    from public.user_trophies ut
    join public.trophies t on t.id = ut.trophy_id
    where ut.user_id = new.user_id
      and t.game_id = new.game_id
      and t.type = 'platinum'
  ) then
    raise exception 'Sólo se puede compartir un platino que conseguiste.';
  end if;
  return new;
end;
$$;

create trigger posts_guard_kind
  before insert or update on public.posts
  for each row execute function public.posts_guard_kind();

-- 4. Preferencias ---------------------------------------------------------------
--
-- Independientes entre sí: hay quien quiere la lluvia sin sonido y quien
-- quiere el sonido sin animaciones. En la base y no en localStorage para que
-- valgan en todos los dispositivos. `users_update_own` ya cubre la escritura.
alter table public.users
  add column platinum_sound_enabled boolean not null default true,
  add column platinum_effects_enabled boolean not null default true;
