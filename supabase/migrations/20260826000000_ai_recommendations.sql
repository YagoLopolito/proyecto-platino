-- Recomendaciones generadas por IA para el diario ("Recomendados para vos").
--
-- Misma forma que ai_game_plans (versionado: cada generación inserta una fila
-- nueva y la UI lee la última `ok`), pero por usuario y no por juego: el input
-- son los platinos/100% del usuario y su biblioteca en curso, no un solo
-- título. No hay variante genérica compartible, así que user_id es not null.
create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  payload_json jsonb not null,
  model text not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  created_at timestamptz not null default now()
);

alter table public.ai_recommendations enable row level security;

-- La última fila `ok` se lee en cada carga de /diario: sin este índice es un
-- seq scan sobre todo el historial de todos los usuarios.
create index ai_recommendations_user_created_idx
  on public.ai_recommendations (user_id, created_at desc);

create policy "ai_recommendations_select_own"
  on public.ai_recommendations for select
  using (auth.uid() = user_id);

create policy "ai_recommendations_insert_own"
  on public.ai_recommendations for insert
  with check (auth.uid() = user_id);

create policy "ai_recommendations_delete_own"
  on public.ai_recommendations for delete
  using (auth.uid() = user_id);
