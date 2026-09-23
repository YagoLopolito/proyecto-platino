-- Listas de usuario (epic #183, issue #189): las listas de Letterboxd, para
-- juegos. Numeradas o no, públicas o privadas.
create table public.user_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text check (description is null or char_length(description) <= 2000),
  is_ranked boolean not null default false,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_lists_user_id on public.user_lists (user_id, updated_at desc);

create table public.user_list_items (
  list_id uuid not null references public.user_lists(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  -- 1..N, el orden de la lista (importa aunque no sea numerada: es el orden en
  -- que el autor la armó).
  position integer not null check (position >= 1),
  note text check (note is null or char_length(note) <= 280),
  primary key (list_id, game_id),
  -- El editor reescribe los items enteros (delete + insert), como el Top 5:
  -- reordenar de a uno pasaría por un estado con dos items en la misma
  -- posición y este unique lo rechazaría.
  unique (list_id, position)
);

-- "En qué listas está este juego" (la ficha, #189; las listas populares, #192).
create index user_list_items_game_id on public.user_list_items (game_id);

alter table public.user_lists enable row level security;
alter table public.user_list_items enable row level security;

-- Una lista pública la ve cualquiera (como el diario); una privada, sólo su
-- dueño.
create policy "user_lists_select_visible"
  on public.user_lists for select
  using (visibility = 'public' or auth.uid() = user_id);

create policy "user_lists_insert_own"
  on public.user_lists for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_lists_update_own"
  on public.user_lists for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_lists_delete_own"
  on public.user_lists for delete
  to authenticated
  using (auth.uid() = user_id);

-- Los items heredan la visibilidad y la autoría de su lista.
create policy "user_list_items_select_visible"
  on public.user_list_items for select
  using (
    exists (
      select 1 from public.user_lists l
      where l.id = list_id and (l.visibility = 'public' or l.user_id = auth.uid())
    )
  );

create policy "user_list_items_insert_own"
  on public.user_list_items for insert
  to authenticated
  with check (
    exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid())
  );

create policy "user_list_items_delete_own"
  on public.user_list_items for delete
  to authenticated
  using (
    exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid())
  );

-- Sin update de items: el editor los reescribe (delete + insert) y el "Agregar
-- a una lista" de la ficha inserta o borra uno.
