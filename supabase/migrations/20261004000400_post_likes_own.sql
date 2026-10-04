-- Galería online: la publicación propia también se likea, como en Instagram
-- (a diferencia de reseñas y listas, que siguen sin poder likearse a sí
-- mismas). El like propio no genera aviso: `get_activity_received` ya descarta
-- `pl.user_id = auth.uid()`.
drop policy if exists "post_likes_insert_own" on public.post_likes;

create policy "post_likes_insert_own"
  on public.post_likes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
  );

-- ROLLBACK
-- drop policy if exists "post_likes_insert_own" on public.post_likes;
-- create policy "post_likes_insert_own" on public.post_likes for insert to authenticated
--   with check (user_id = auth.uid() and exists (select 1 from public.posts p
--     where p.id = post_id and p.status = 'published' and p.user_id <> auth.uid()));
