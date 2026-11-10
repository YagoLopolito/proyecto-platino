-- Contador de progreso de un trofeo ("3 de 10"), por usuario.
--
-- PSN lo informa sólo en títulos de PS5 y sólo para los trofeos que el juego
-- declara con contador. Va en una tabla aparte y no en `user_trophies`: ahí
-- una fila significa "trofeo obtenido" en toda la app (stats, platinos,
-- actividad), y el progreso es justamente de los que todavía no se tienen.
--
-- `target` se guarda acá además de en `trophies.progress_target`: las filas
-- compartidas sólo las reescribe el sync de quien dio de alta el juego, y el
-- contador tiene que andar para cualquiera que lo sincronice.
create table public.user_trophy_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  trophy_id uuid not null references public.trophies(id) on delete cascade,
  progress integer not null check (progress >= 0),
  target integer check (target is null or target > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, trophy_id)
);

alter table public.user_trophy_progress enable row level security;

-- Privado, igual que `user_trophies`.
create policy "user_trophy_progress_select_own"
  on public.user_trophy_progress for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_trophy_progress_insert_own"
  on public.user_trophy_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_trophy_progress_update_own"
  on public.user_trophy_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_trophy_progress_delete_own"
  on public.user_trophy_progress for delete
  to authenticated
  using (auth.uid() = user_id);
