create table public.user_trophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  trophy_id uuid not null references public.trophies(id) on delete cascade,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, trophy_id)
);

alter table public.user_trophies enable row level security;

create policy "user_trophies_select_own"
  on public.user_trophies for select
  using (auth.uid() = user_id);

create policy "user_trophies_insert_own"
  on public.user_trophies for insert
  with check (auth.uid() = user_id);

create policy "user_trophies_update_own"
  on public.user_trophies for update
  using (auth.uid() = user_id);

create policy "user_trophies_delete_own"
  on public.user_trophies for delete
  using (auth.uid() = user_id);
