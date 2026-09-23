-- Playlist (epic #183, issue #188): los juegos que querés jugar. El
-- equivalente de la Watchlist de Letterboxd.
--
-- No depende de `user_games`: casi siempre es un juego que todavía NO tenés,
-- por eso la ficha abre cualquier juego del catálogo (issue #186).
create table public.user_playlist (
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

-- "Está en la Playlist de N amigos" consulta por juego.
create index user_playlist_game_id on public.user_playlist (game_id);

alter table public.user_playlist enable row level security;

-- Pública, como la watchlist de Letterboxd y el resto del perfil (diario,
-- Top 5, jugando ahora).
create policy "user_playlist_select_all"
  on public.user_playlist for select
  using (true);

create policy "user_playlist_insert_own"
  on public.user_playlist for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Sin update: una fila no tiene nada que editar. Sacar un juego es borrarlo.
create policy "user_playlist_delete_own"
  on public.user_playlist for delete
  to authenticated
  using (auth.uid() = user_id);
