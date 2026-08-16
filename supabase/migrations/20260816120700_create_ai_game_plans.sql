-- user_id nullable: plan genérico compartible entre usuarios (solo escribible por service role,
-- que bypassea RLS) vs. plan user-scoped (dueño puede leer/escribir el suyo).
create table public.ai_game_plans (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  payload_json jsonb not null,
  model text not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  created_at timestamptz not null default now()
);

alter table public.ai_game_plans enable row level security;

create policy "ai_game_plans_select_own_or_generic"
  on public.ai_game_plans for select
  using (user_id is null or auth.uid() = user_id);

create policy "ai_game_plans_insert_own"
  on public.ai_game_plans for insert
  with check (auth.uid() = user_id);

create policy "ai_game_plans_delete_own"
  on public.ai_game_plans for delete
  using (auth.uid() = user_id);
