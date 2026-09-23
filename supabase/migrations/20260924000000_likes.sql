-- Likes en reseñas y listas (epic #183, issue #190). Dos tablas y no una
-- polimórfica: así cada una tiene su FK real y `on delete cascade` (borrar la
-- reseña o la lista se lleva sus likes).
--
-- Sin contadores denormalizados: se cuentan en la query. El volumen es chico y
-- así no hay un contador que diverja de las filas.
create table public.review_likes (
  user_id uuid not null references public.users(id) on delete cascade,
  entry_id uuid not null references public.game_diary_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);

-- "Cuántos likes tiene esta reseña" y "qué likes recibió X" (Actividad, #195).
create index review_likes_entry_id on public.review_likes (entry_id);

create table public.list_likes (
  user_id uuid not null references public.users(id) on delete cascade,
  list_id uuid not null references public.user_lists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, list_id)
);

create index list_likes_list_id on public.list_likes (list_id);

alter table public.review_likes enable row level security;
alter table public.list_likes enable row level security;

-- Públicos, como el diario: un like es algo que se muestra.
create policy "review_likes_select_all"
  on public.review_likes for select
  using (true);

-- Sólo a tu nombre y nunca sobre una reseña tuya (la Server Action también lo
-- valida: doble capa, como toda la autoría de la app).
create policy "review_likes_insert_own"
  on public.review_likes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.game_diary_entries e
      where e.id = entry_id and e.user_id <> auth.uid()
    )
  );

create policy "review_likes_delete_own"
  on public.review_likes for delete
  to authenticated
  using (auth.uid() = user_id);

-- El like de una lista privada no se lee aunque exista: la lista es de su
-- dueño, y sus likes también.
create policy "list_likes_select_visible"
  on public.list_likes for select
  using (
    exists (
      select 1 from public.user_lists l
      where l.id = list_id and (l.visibility = 'public' or l.user_id = auth.uid())
    )
  );

-- Sólo sobre una lista pública y ajena: una privada no es visible para quien
-- no es su dueño, y la propia no se likea.
create policy "list_likes_insert_own"
  on public.list_likes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_lists l
      where l.id = list_id and l.visibility = 'public' and l.user_id <> auth.uid()
    )
  );

create policy "list_likes_delete_own"
  on public.list_likes for delete
  to authenticated
  using (auth.uid() = user_id);
