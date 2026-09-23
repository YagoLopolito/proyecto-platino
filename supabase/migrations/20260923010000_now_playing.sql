-- "Jugando ahora" (epic #183, issue #187).
--
-- Una fila por racha de juego: `started_at` cuando el usuario dice que lo está
-- jugando, `ended_at` cuando lo deja (a mano, por platino / 100% en el sync o
-- porque registró la partida en el diario). No se borra al terminar: queda el
-- historial, que es lo que después alimenta "jugando desde..." y la actividad.
create table public.now_playing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('manual', 'platinum', 'completion', 'diary_entry')),
  -- Las dos columnas van juntas: una racha terminada siempre dice por qué.
  constraint now_playing_end_consistent check ((ended_at is null) = (end_reason is null))
);

-- Un juego no puede estar "jugando" dos veces a la vez, pero sí varias veces
-- en la vida (rejugadas): el unique es parcial sobre las rachas abiertas.
create unique index now_playing_one_open_per_game
  on public.now_playing (user_id, game_id)
  where ended_at is null;

-- Lo que más se consulta: lo que alguien está jugando ahora (perfil, ficha).
create index now_playing_open_by_game on public.now_playing (game_id) where ended_at is null;

alter table public.now_playing enable row level security;

-- Público, igual que el diario y el Top 5: "Jugando ahora" se muestra en los
-- perfiles de otros usuarios y en la ficha ("N amigos lo están jugando").
create policy "now_playing_select_all"
  on public.now_playing for select
  using (true);

create policy "now_playing_insert_own"
  on public.now_playing for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Update para cerrar la racha. El `with check` impide pasarle la fila a otro.
create policy "now_playing_update_own"
  on public.now_playing for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sin policy de delete a propósito: el historial no se borra desde la app.

-- Sugerencia del sync: "¿Empezaste X?". No se guarda la sugerencia en sí --
-- sale de `last_played_at`, que el sync ya escribe --, sino hasta dónde la
-- descartó el usuario: el `last_played_at` que tenía el juego cuando dijo
-- "Descartar". Se vuelve a sugerir recién con un `last_played_at` más nuevo.
alter table public.user_games
  add column play_suggestion_dismissed_at timestamptz;
