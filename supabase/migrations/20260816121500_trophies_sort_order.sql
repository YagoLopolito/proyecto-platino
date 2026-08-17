-- Orden de los trofeos dentro de un juego.
-- Nullable a proposito: en carga manual el usuario puede no conocer el orden
-- oficial, y al importar desde PSN se completa con el orden que devuelve la API.
-- Las vistas ordenan por sort_order y caen a created_at cuando es NULL.
alter table public.trophies add column sort_order integer;

create index trophies_game_id_sort_order_idx
  on public.trophies (game_id, sort_order nulls last);
