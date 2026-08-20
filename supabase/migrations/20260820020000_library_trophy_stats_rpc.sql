-- Agrega trofeos por juego (total/obtenidos por tipo) del lado de la base en vez de
-- traer miles de filas de `trophies`/`user_trophies` a memoria del servidor Next.js
-- y sumar en JS con paginado manual (era el cuello de botella real de /juegos y
-- /juegos/[id]: con bibliotecas de varios miles de trofeos, el paginado de a 1000
-- filas se hacía en un for-loop serial -- varios round-trips seriales por carga).
--
-- security invoker (default) + auth.uid(): corre con los permisos del usuario logueado,
-- respeta las mismas RLS que ya protegen trophies/user_trophies/user_games, no hace
-- falta security definer.
create or replace function public.get_library_trophy_stats()
returns table (
  game_id uuid,
  total integer,
  obtained integer,
  platinum integer,
  gold integer,
  silver integer,
  bronze integer
)
language sql
stable
set search_path = public
as $$
  select
    t.game_id,
    count(*)::int as total,
    count(ut.trophy_id)::int as obtained,
    count(*) filter (where t.type = 'platinum' and ut.trophy_id is not null)::int as platinum,
    count(*) filter (where t.type = 'gold' and ut.trophy_id is not null)::int as gold,
    count(*) filter (where t.type = 'silver' and ut.trophy_id is not null)::int as silver,
    count(*) filter (where t.type = 'bronze' and ut.trophy_id is not null)::int as bronze
  from public.trophies t
  join public.user_games ug on ug.game_id = t.game_id and ug.user_id = auth.uid()
  left join public.user_trophies ut on ut.trophy_id = t.id and ut.user_id = auth.uid()
  group by t.game_id;
$$;

grant execute on function public.get_library_trophy_stats() to authenticated;
