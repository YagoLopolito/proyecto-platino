-- Galería online: publicaciones de fotos y videos estilo Instagram.
--
-- Un post es 1..10 archivos (carrusel) de un juego, con descripción opcional y
-- marca de spoiler. A diferencia del diario, NADA de esto es legible sin
-- sesión: ni las filas (`to authenticated` en todas las policies) ni los
-- archivos (bucket privado, se leen con URLs firmadas generadas server-side).
--
-- Flujo de publicación (ver lib/posts/actions.ts):
--   1. `createDraftPost` inserta el post en `status = 'uploading'`.
--   2. El browser sube los archivos directo a Storage (TUS, con la sesión del
--      usuario): la policy de storage.objects sólo deja escribir en
--      `{auth.uid()}/{post propio en uploading}/...`.
--   3. `confirmPost` revalida cada objeto (tamaño, MIME real por magic bytes),
--      inserta `post_media` y pasa el post a `published`.
-- Un post que se queda en `uploading` (pestaña cerrada a mitad de subida) lo
-- borra el paso de limpieza del cron (lib/posts/cleanup.ts), con sus archivos.
--
-- Sin contadores denormalizados (mismo criterio que review_likes/list_likes):
-- `get_post_stats` cuenta likes y comentarios de los ids de una página en una
-- sola consulta.
--
-- Reportes/moderación: no existen todavía. Una tabla `post_reports (post_id,
-- reporter_id, reason)` con FK en cascada encaja sin tocar nada de esto.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  caption text check (caption is null or char_length(caption) <= 2200),
  is_spoiler boolean not null default false,
  status text not null default 'uploading' check (status in ('uploading', 'published')),
  created_at timestamptz not null default now(),
  -- El orden del feed: cuándo se publicó, no cuándo arrancó la subida.
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  -- Sólo se escribe al editar un post ya publicado (la UI muestra "editado").
  edited_at timestamptz,
  constraint posts_published_consistent check ((status = 'published') = (published_at is not null))
);

create index posts_feed on public.posts (user_id, published_at desc) where status = 'published';
create index posts_by_game on public.posts (game_id, published_at desc) where status = 'published';
create index posts_uploading on public.posts (created_at) where status = 'uploading';

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  -- 0..9 + el unique de abajo = tope de 10 archivos por post.
  position smallint not null check (position between 0 and 9),
  -- Original, sin recomprimir. Es lo que se ve en el detalle.
  storage_path text not null unique,
  -- Derivado liviano (WebP de 1080 px) generado en el cliente al subir, para el
  -- feed y la grilla. NULL en videos y GIFs (se usa el poster / el original).
  display_path text,
  -- Frame del video generado en el cliente al subir. NULL en imágenes.
  poster_path text,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  duration_seconds numeric(8, 2),
  size_bytes bigint not null check (size_bytes > 0),
  unique (post_id, position)
);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_likes_post_id on public.post_likes (post_id);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index post_comments_post_id on public.post_comments (post_id, created_at desc);

alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

-- posts ----------------------------------------------------------------------

-- Publicados: cualquiera con sesión. En subida: sólo su autor.
create policy "posts_select_visible"
  on public.posts for select
  to authenticated
  using (status = 'published' or user_id = auth.uid());

create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'uploading' and published_at is null);

create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "posts_delete_own"
  on public.posts for delete
  to authenticated
  using (user_id = auth.uid());

-- Lo que el `with check` no puede expresar (comparar con la fila vieja): un
-- post no cambia de dueño ni de juego, no vuelve a `uploading`, y no se publica
-- vacío. Editar un publicado marca `edited_at`.
create or replace function public.posts_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id <> old.user_id or new.game_id <> old.game_id or new.created_at <> old.created_at then
    raise exception 'No se puede cambiar el autor, el juego ni la fecha de un post.';
  end if;

  if old.status = 'published' and new.status <> 'published' then
    raise exception 'Un post publicado no vuelve a estar en subida.';
  end if;

  if old.status = 'uploading' and new.status = 'published' then
    if not exists (select 1 from public.post_media m where m.post_id = new.id) then
      raise exception 'Un post necesita al menos un archivo para publicarse.';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;

  if old.status = 'published' and new.published_at is distinct from old.published_at then
    new.published_at := old.published_at;
  end if;

  if old.status = 'published'
    and (new.caption is distinct from old.caption or new.is_spoiler <> old.is_spoiler) then
    new.edited_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger posts_guard_update
  before update on public.posts
  for each row execute function public.posts_guard_update();

-- post_media -----------------------------------------------------------------

-- Hereda la visibilidad del post (la policy de posts se aplica dentro del exists).
create policy "post_media_select_visible"
  on public.post_media for select
  to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

-- Los archivos se cargan mientras el post está en subida; después no se tocan
-- (editar un post publicado es sólo descripción y spoiler).
create policy "post_media_insert_own_uploading"
  on public.post_media for insert
  to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.user_id = auth.uid() and p.status = 'uploading'
    )
  );

create policy "post_media_delete_own"
  on public.post_media for delete
  to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- post_likes -----------------------------------------------------------------

create policy "post_likes_select_visible"
  on public.post_likes for select
  to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

-- A tu nombre, sobre un post publicado y ajeno: la propia publicación no se
-- likea, mismo criterio que reseñas y listas (la Server Action lo valida
-- también, con mensaje).
create policy "post_likes_insert_own"
  on public.post_likes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.status = 'published' and p.user_id <> auth.uid()
    )
  );

create policy "post_likes_delete_own"
  on public.post_likes for delete
  to authenticated
  using (user_id = auth.uid());

-- post_comments --------------------------------------------------------------

create policy "post_comments_select_visible"
  on public.post_comments for select
  to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "post_comments_insert_own"
  on public.post_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
  );

-- Borra un comentario su autor o el autor del post. Sin update: no se editan.
create policy "post_comments_delete_own_or_post_author"
  on public.post_comments for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- Contadores -----------------------------------------------------------------

-- Likes, comentarios y "¿le di like?" de los posts de una página, en una sola
-- consulta. `security invoker`: respeta las RLS de arriba.
create or replace function public.get_post_stats(post_ids uuid[])
returns table (post_id uuid, like_count integer, comment_count integer, liked_by_me boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    (select count(*)::integer from public.post_likes l where l.post_id = p.id),
    (select count(*)::integer from public.post_comments c where c.post_id = p.id),
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid())
  from public.posts p
  where p.id = any (post_ids);
$$;

revoke all on function public.get_post_stats(uuid[]) from public, anon;
grant execute on function public.get_post_stats(uuid[]) to authenticated;

-- Storage --------------------------------------------------------------------

-- Bucket PRIVADO: los archivos se leen con URLs firmadas generadas en el
-- server, con la sesión de quien mira. Los límites se repiten en
-- lib/posts/constants.ts: Storage rechaza la subida antes de que el server vea
-- nada, así que si se cambian hay que cambiarlos en los dos lados.
-- 50 MB es el tope por archivo del plan Free de Supabase (el de un video; las
-- imágenes tienen un tope más bajo que valida la app).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path: `{user_id}/{post_id}/{position}-{uuid}.{ext}`. Escribir sólo en tu
-- carpeta y dentro de un post tuyo que siga en subida: un post publicado ya no
-- recibe archivos.
create policy "post_media_objects_insert_own_uploading"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.posts p
      where p.id::text = (storage.foldername(name))[2]
        and p.user_id = auth.uid()
        and p.status = 'uploading'
    )
  );

-- TUS reanuda con PATCH sobre el mismo objeto: necesita update, con las mismas
-- condiciones que el insert.
create policy "post_media_objects_update_own_uploading"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.posts p
      where p.id::text = (storage.foldername(name))[2]
        and p.user_id = auth.uid()
        and p.status = 'uploading'
    )
  );

-- Leer (firmar una URL) exige que el post sea visible para quien mira.
create policy "post_media_objects_select_visible"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'post-media'
    and exists (
      select 1 from public.posts p
      where p.id::text = (storage.foldername(name))[2]
    )
  );

create policy "post_media_objects_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ROLLBACK
-- drop policy if exists "post_media_objects_delete_own" on storage.objects;
-- drop policy if exists "post_media_objects_select_visible" on storage.objects;
-- drop policy if exists "post_media_objects_update_own_uploading" on storage.objects;
-- drop policy if exists "post_media_objects_insert_own_uploading" on storage.objects;
-- delete from storage.buckets where id = 'post-media';  -- (vaciar el bucket antes)
-- drop function if exists public.get_post_stats(uuid[]);
-- drop table if exists public.post_comments;
-- drop table if exists public.post_likes;
-- drop table if exists public.post_media;
-- drop table if exists public.posts;
-- drop function if exists public.posts_guard_update();
