-- Tiempos estimados de juego, al estilo HowLongToBeat: cuánto lleva pasarse la
-- historia principal y cuánto llegar al 100%. Se muestran en la ficha de
-- trofeos y en la ficha de diario.
--
-- HowLongToBeat no tiene API pública (su endpoint interno cambia con cada
-- release del sitio y su ToS no permite scrapearlo), así que los datos salen
-- de IGDB (`game_time_to_beat`, API oficial y gratuita de Twitch), con el
-- `playtime` de RAWG como último recurso para el tiempo de historia.
--
-- Sin RLS nueva: `games` ya la tiene, y esto es catálogo público compartido,
-- igual que la descripción y el fondo.
alter table public.games
  add column if not exists time_to_beat_minutes integer,
  add column if not exists time_to_complete_minutes integer,
  add column if not exists time_estimates_source text,
  add column if not exists time_estimates_checked_at timestamptz;

comment on column public.games.time_to_beat_minutes is
  'Minutos estimados para terminar la historia principal. NULL = no se sabe.';

comment on column public.games.time_to_complete_minutes is
  'Minutos estimados para completarlo al 100%. NULL = no se sabe (RAWG no lo publica).';

comment on column public.games.time_estimates_source is
  'igdb = IGDB game_time_to_beat; rawg = playtime promedio de RAWG (solo historia); none = se consultó y no había datos.';

comment on column public.games.time_estimates_checked_at is
  'Cuándo se consultaron las fuentes. NULL = nunca; con valor no se vuelve a consultar aunque los tiempos hayan quedado en NULL.';
