-- Perfil de la app, extiende auth.users (no duplica columnas que ya vienen de Supabase Auth)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id);

create policy "users_insert_own"
  on public.users for insert
  with check (auth.uid() = id);

-- Crea automáticamente la fila de perfil cuando se registra un usuario en auth.users
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- El trigger llama a esta función internamente; no necesita ser invocable vía RPC pública.
revoke execute on function public.handle_new_user() from anon, authenticated;
