-- Guías: lectura pública (cualquier usuario puede usarlas para su checklist),
-- pero solo el autor puede crear/editar/borrar las suyas.
create table public.guides (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  content_markdown text,
  external_url text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guides enable row level security;

create policy "guides_select_all"
  on public.guides for select
  using (true);

create policy "guides_insert_own"
  on public.guides for insert
  with check (auth.uid() = author_id);

create policy "guides_update_own"
  on public.guides for update
  using (auth.uid() = author_id);

create policy "guides_delete_own"
  on public.guides for delete
  using (auth.uid() = author_id);

create table public.guide_steps (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  trophy_id uuid references public.trophies(id) on delete set null,
  step_order int not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.guide_steps enable row level security;

create policy "guide_steps_select_all"
  on public.guide_steps for select
  using (true);

create policy "guide_steps_insert_own"
  on public.guide_steps for insert
  with check (
    exists (
      select 1 from public.guides
      where guides.id = guide_steps.guide_id
      and guides.author_id = auth.uid()
    )
  );

create policy "guide_steps_update_own"
  on public.guide_steps for update
  using (
    exists (
      select 1 from public.guides
      where guides.id = guide_steps.guide_id
      and guides.author_id = auth.uid()
    )
  );

create policy "guide_steps_delete_own"
  on public.guide_steps for delete
  using (
    exists (
      select 1 from public.guides
      where guides.id = guide_steps.guide_id
      and guides.author_id = auth.uid()
    )
  );
