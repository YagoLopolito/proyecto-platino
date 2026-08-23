-- Datos "de ficha" del juego para la vista tipo Letterbox del diario:
-- descripción, desarrolladora, año y una imagen de fondo (todos opcionales,
-- vienen de RAWG vía lib/covers). Sin RLS nueva: `games` ya la tiene.
alter table public.games
  add column if not exists description text,
  add column if not exists developer text,
  add column if not exists release_year integer,
  add column if not exists background_url text;
