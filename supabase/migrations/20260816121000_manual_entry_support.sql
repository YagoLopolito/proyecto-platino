-- Habilita la carga manual de juegos y trofeos.
--
-- El esquema original asumia que `games` y `trophies` los poblaba el sync de
-- PSN con el service role. Esa integracion se saco del proyecto, asi que ahora
-- los datos los cargan los usuarios: hace falta aflojar las columnas que venian
-- de la API de Sony, abrir las politicas de escritura y agregar el vinculo
-- usuario <-> juego, que antes lo establecia implicitamente el sync.

-- 1. Los IDs de PSN pasan a ser opcionales -----------------------------------
-- Un juego o trofeo cargado a mano no tiene identificadores de Sony. El unique
-- sigue valiendo para los que si los tienen: Postgres permite varios NULL en
-- una columna unique, asi que no hay colision entre filas manuales.
alter table public.games alter column np_comm_id drop not null;
alter table public.trophies alter column trophy_id drop not null;

-- 2. Autoria, para poder acotar quien edita que -------------------------------
-- NULL = fila del catalogo base (o importada por PSN en el futuro); esas nadie
-- las edita desde el cliente.
alter table public.games add column created_by uuid references public.users(id) on delete set null;
alter table public.trophies add column created_by uuid references public.users(id) on delete set null;

-- Distingue el origen de la fila. Util para reconciliar cuando se retome PSN.
alter table public.games add column source text not null default 'manual'
  check (source in ('manual', 'psn'));

create index games_created_by_idx on public.games (created_by);
create index trophies_created_by_idx on public.trophies (created_by);

-- 3. Escritura del catalogo por usuarios autenticados -------------------------
-- Insertar: cualquiera logueado, siempre declarandose autor.
-- Editar/borrar: solo el autor de la fila. Las filas sin autor quedan
-- intocables desde el cliente.
create policy "games_insert_authenticated"
  on public.games for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "games_update_own"
  on public.games for update
  to authenticated
  using (auth.uid() = created_by);

create policy "games_delete_own"
  on public.games for delete
  to authenticated
  using (auth.uid() = created_by);

create policy "trophies_insert_authenticated"
  on public.trophies for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "trophies_update_own"
  on public.trophies for update
  to authenticated
  using (auth.uid() = created_by);

create policy "trophies_delete_own"
  on public.trophies for delete
  to authenticated
  using (auth.uid() = created_by);

-- 4. Biblioteca: el vinculo usuario <-> juego ---------------------------------
-- Sin esto, la biblioteca de un usuario solo se puede inferir de los trofeos
-- que ya desbloqueo, y un juego recien empezado (cero trofeos) seria invisible.
create table public.user_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (user_id, game_id)
);

alter table public.user_games enable row level security;

create index user_games_user_id_idx on public.user_games (user_id);

create policy "user_games_select_own"
  on public.user_games for select
  using (auth.uid() = user_id);

create policy "user_games_insert_own"
  on public.user_games for insert
  with check (auth.uid() = user_id);

create policy "user_games_delete_own"
  on public.user_games for delete
  using (auth.uid() = user_id);
