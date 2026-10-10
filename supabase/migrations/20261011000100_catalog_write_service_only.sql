-- Issue #164: el catálogo compartido (`games`, `trophies`, `trophy_groups`)
-- deja de ser editable por `authenticated`.
--
-- Las policies de UPDATE/DELETE colgaban de `created_by`, que en la práctica
-- es "el primero que sincronizó el juego". Ese usuario podía, por PostgREST,
-- renombrar juegos y trofeos que ve toda la app, cambiar sus imágenes a
-- cualquier URL o BORRAR el juego, y con el `on delete cascade` llevarse los
-- `user_trophies` y el diario de todos los demás.
--
-- Ahora:
-- - El sync de PSN y el de Steam escriben el catálogo con service role
--   (lib/psn/sync.ts, lib/steam/sync.ts). Ningún código de la app edita ni
--   borra `games`/`trophies` con la sesión del usuario.
-- - `authenticated` sólo puede INSERTAR un juego de catálogo propio
--   (`source = 'catalog'`, lo que hace `addCatalogGame` desde el buscador), y
--   sin `np_comm_id` ni `steam_appid`: con esos ids un usuario podía ocupar
--   antes que el sync la fila de un juego de PSN/Steam y elegirle el nombre.
-- - Nadie con sesión edita ni borra: ni trofeos, ni grupos, ni juegos (tampoco
--   los de catálogo propios, que otros pueden tener en su diario, listas o
--   Playlist sin pasar por `user_games`). Con eso el cascade de un borrado sólo
--   lo puede disparar service role.

drop policy if exists "games_update_own" on public.games;
drop policy if exists "games_delete_own" on public.games;
drop policy if exists "games_insert_authenticated" on public.games;

create policy "games_insert_catalog_own"
  on public.games for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and source = 'catalog'
    and np_comm_id is null
    and steam_appid is null
  );

drop policy if exists "trophies_insert_authenticated" on public.trophies;
drop policy if exists "trophies_update_own" on public.trophies;
drop policy if exists "trophies_delete_own" on public.trophies;

drop policy if exists "trophy_groups_insert_authenticated" on public.trophy_groups;
drop policy if exists "trophy_groups_update_own" on public.trophy_groups;

revoke update, delete on public.games from anon, authenticated;
revoke insert, update, delete on public.trophies from anon, authenticated;
revoke insert, update, delete on public.trophy_groups from anon, authenticated;

-- ROLLBACK
-- grant update, delete on public.games to authenticated;
-- grant insert, update, delete on public.trophies to authenticated;
-- grant insert, update, delete on public.trophy_groups to authenticated;
-- drop policy if exists "games_insert_catalog_own" on public.games;
-- create policy "games_insert_authenticated" on public.games for insert
--   to authenticated with check (auth.uid() = created_by);
-- create policy "games_update_own" on public.games for update
--   to authenticated using (auth.uid() = created_by);
-- create policy "games_delete_own" on public.games for delete
--   to authenticated using (auth.uid() = created_by);
-- create policy "trophies_insert_authenticated" on public.trophies for insert
--   to authenticated with check (auth.uid() = created_by);
-- create policy "trophies_update_own" on public.trophies for update
--   to authenticated using (auth.uid() = created_by);
-- create policy "trophies_delete_own" on public.trophies for delete
--   to authenticated using (auth.uid() = created_by);
-- create policy "trophy_groups_insert_authenticated" on public.trophy_groups for insert
--   to authenticated with check (auth.uid() = created_by);
-- create policy "trophy_groups_update_own" on public.trophy_groups for update
--   to authenticated using (auth.uid() = created_by);
