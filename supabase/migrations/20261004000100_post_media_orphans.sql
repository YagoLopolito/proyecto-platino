-- Galería online: archivos huérfanos del bucket `post-media`.
--
-- Un objeto queda huérfano cuando su post ya no existe: se borró (y el borrado
-- de Storage de `deletePost` falló a mitad de camino) o era un post abandonado
-- en subida que limpió el cron. El paso de limpieza de `/api/cron/sync`
-- (lib/posts/cleanup.ts) pide esta lista y borra los objetos por la API de
-- Storage -- nunca con un `delete from storage.objects`, que dejaría el archivo
-- físico.
--
-- Sólo `service_role`: recorre los archivos de todos los usuarios.
create or replace function public.post_media_orphans(older_than timestamptz, max_rows integer)
returns table (name text)
language sql
stable
security invoker
set search_path = public, storage
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'post-media'
    and o.created_at < older_than
    and not exists (
      select 1 from public.posts p
      where p.id::text = (storage.foldername(o.name))[2]
    )
  order by o.created_at
  limit least(greatest(max_rows, 1), 1000);
$$;

revoke all on function public.post_media_orphans(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.post_media_orphans(timestamptz, integer) to service_role;

-- ROLLBACK
-- drop function if exists public.post_media_orphans(timestamptz, integer);
