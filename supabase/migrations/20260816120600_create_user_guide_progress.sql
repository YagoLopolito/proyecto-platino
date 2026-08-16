create table public.user_guide_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  guide_step_id uuid not null references public.guide_steps(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, guide_step_id)
);

alter table public.user_guide_progress enable row level security;

create policy "user_guide_progress_select_own"
  on public.user_guide_progress for select
  using (auth.uid() = user_id);

create policy "user_guide_progress_insert_own"
  on public.user_guide_progress for insert
  with check (auth.uid() = user_id);

create policy "user_guide_progress_update_own"
  on public.user_guide_progress for update
  using (auth.uid() = user_id);

create policy "user_guide_progress_delete_own"
  on public.user_guide_progress for delete
  using (auth.uid() = user_id);
