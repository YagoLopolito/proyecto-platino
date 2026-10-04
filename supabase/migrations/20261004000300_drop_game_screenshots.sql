-- Retira la galería de capturas vieja (`game_screenshots`), reemplazada por la
-- Galería online (`posts`, migración 20261004000000_posts.sql).
--
-- ORDEN: primero `node scripts/migrate-screenshots-to-posts.mjs`, que pasa
-- cada captura a una publicación, la borra de `game_screenshots` y vacía y
-- borra el bucket público `game-screenshots` por la API de Storage (no se puede
-- borrar un bucket ni sus objetos por SQL). Esta migración se niega a correr si
-- todavía queda alguna captura sin migrar: borrarla perdería datos.

do $$
begin
  if exists (select 1 from public.game_screenshots) then
    raise exception
      'Quedan capturas en game_screenshots: corré scripts/migrate-screenshots-to-posts.mjs antes.';
  end if;
end $$;

drop policy if exists "game_screenshots_objects_insert_own" on storage.objects;
drop policy if exists "game_screenshots_objects_update_own" on storage.objects;
drop policy if exists "game_screenshots_objects_delete_own" on storage.objects;
drop policy if exists "game_screenshots_objects_select_public" on storage.objects;

drop table public.game_screenshots;

-- ROLLBACK
-- Recrear desde 20260823000000_game_screenshots.sql (la tabla queda vacía: los
-- datos viven ahora en posts / post_media).
