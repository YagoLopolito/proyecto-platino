-- Galería de capturas por juego: el usuario sube sus propias imágenes (Sony no
-- expone la galería de capturas de PSN por ninguna API usable, ver CLAUDE.md).
-- Los archivos viven en Storage; esta tabla es solo el índice + metadata.

create table public.game_screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  -- Path dentro del bucket `game-screenshots`. Siempre arranca con el uuid del
  -- usuario: es lo que atan las policies de storage.objects de más abajo.
  storage_path text not null unique,
  caption text,
  created_at timestamptz not null default now()
);

alter table public.game_screenshots enable row level security;

create index game_screenshots_game_id_idx on public.game_screenshots (game_id, created_at desc);
create index game_screenshots_user_id_idx on public.game_screenshots (user_id, created_at desc);

-- Públicas, mismo criterio que game_diary_entries (el diario es público y esto
-- es parte del diario). Escribir/borrar, solo el dueño.
create policy "game_screenshots_select_all"
  on public.game_screenshots for select
  using (true);

create policy "game_screenshots_insert_own"
  on public.game_screenshots for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "game_screenshots_update_own"
  on public.game_screenshots for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "game_screenshots_delete_own"
  on public.game_screenshots for delete
  to authenticated
  using (auth.uid() = user_id);

-- Bucket público de lectura: las imágenes se sirven por URL directa (y pasan
-- por el optimizador de next/image), igual que las carátulas de RAWG/Steam.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-screenshots',
  'game-screenshots',
  true,
  10485760, -- 10 MB, igual que MAX_SCREENSHOT_BYTES en lib/diary/screenshot-constants.ts
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La subida va directo del browser a Storage (un Server Action tiene límite de
-- body y una captura pesa varios MB), así que el control de quién escribe qué
-- es esta policy: la primera carpeta del path tiene que ser el uuid del usuario.
create policy "game_screenshots_objects_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'game-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "game_screenshots_objects_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'game-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "game_screenshots_objects_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'game-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "game_screenshots_objects_select_public"
  on storage.objects for select
  using (bucket_id = 'game-screenshots');
