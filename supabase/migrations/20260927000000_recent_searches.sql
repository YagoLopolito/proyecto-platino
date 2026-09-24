-- Búsquedas recientes (epic #183, issue #194). Viven en la base y no en
-- `localStorage` para que se compartan entre el celu y la PC.
--
-- Una fila por (usuario, query sin distinguir mayúsculas, ámbito): repetir una
-- búsqueda sólo actualiza `searched_at`. Tope de 20 por usuario, que aplica
-- `save_recent_search` al insertar.
create table public.recent_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  query text not null check (char_length(query) between 1 and 100),
  scope text not null check (scope in ('todo', 'juegos', 'estudios', 'listas', 'usuarios')),
  searched_at timestamptz not null default now()
);

create unique index recent_searches_unique
  on public.recent_searches (user_id, lower(query), scope);
create index recent_searches_user_recent
  on public.recent_searches (user_id, searched_at desc);

alter table public.recent_searches enable row level security;

-- Privadas: todo, sólo el dueño.
create policy "recent_searches_select_own"
  on public.recent_searches for select
  to authenticated
  using (auth.uid() = user_id);

create policy "recent_searches_insert_own"
  on public.recent_searches for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "recent_searches_update_own"
  on public.recent_searches for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recent_searches_delete_own"
  on public.recent_searches for delete
  to authenticated
  using (auth.uid() = user_id);

-- El unique es sobre `lower(query)`, una expresión: PostgREST no puede usarlo
-- como `onConflict` de un upsert. Por eso el guardado es una función.
-- `security invoker`: corre con la sesión del usuario y respeta las RLS.
create or replace function public.save_recent_search(p_query text, p_scope text, p_max integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;

  insert into public.recent_searches (user_id, query, scope)
  values (auth.uid(), p_query, p_scope)
  on conflict (user_id, lower(query), scope)
  do update set searched_at = now(), query = excluded.query;

  delete from public.recent_searches
  where user_id = auth.uid()
    and id not in (
      select id from public.recent_searches
      where user_id = auth.uid()
      order by searched_at desc
      limit p_max
    );
end;
$$;

revoke all on function public.save_recent_search(text, text, integer) from public, anon;
grant execute on function public.save_recent_search(text, text, integer) to authenticated;
