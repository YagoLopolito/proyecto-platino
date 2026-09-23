-- Epic #183, issue #186: cualquier juego del catálogo externo (RAWG) tiene
-- ficha, lo tengas o no en tu biblioteca. Al abrirla desde la búsqueda, la fila
-- de `games` se materializa server-side (`lib/catalog/materialize.ts`), y dos
-- usuarios pueden abrir el mismo juego a la vez: la unicidad tiene que vivir en
-- la base, no en un "select antes de insertar".
--
-- Índice único común y no parcial a propósito: PostgREST sólo puede usar un
-- índice como destino de `on conflict` si no es parcial, y en Postgres los NULL
-- ya son distintos entre sí, así que los juegos sin id de catálogo (los que
-- trae el sync de PSN/Steam) no chocan.

-- 1. Duplicados previos. `addCatalogGame` insertaba sin chequear, así que
--    puede haber dos filas `source = 'catalog'` con el mismo id de RAWG (en la
--    base real había exactamente una: la misma persona agregando el mismo juego
--    dos veces). Se conserva la más vieja, se re-vinculan los `user_games` de
--    las otras y se borran sólo las que no tienen nada colgando (diario, Top 5,
--    capturas). Si alguna tuviera algo, queda y el índice de abajo falla: mejor
--    un error explícito que perder una reseña.
with ranked as (
  select id, external_catalog_id,
         row_number() over (partition by external_catalog_id order by created_at, id) as rn
  from public.games
  where external_catalog_id is not null and source = 'catalog'
),
dups as (
  select r.id as dup_id, k.id as keep_id
  from ranked r
  join ranked k on k.external_catalog_id = r.external_catalog_id and k.rn = 1
  where r.rn > 1
)
insert into public.user_games (user_id, game_id)
select ug.user_id, d.keep_id
from public.user_games ug
join dups d on d.dup_id = ug.game_id
on conflict (user_id, game_id) do nothing;

with ranked as (
  select id, external_catalog_id,
         row_number() over (partition by external_catalog_id order by created_at, id) as rn
  from public.games
  where external_catalog_id is not null and source = 'catalog'
)
delete from public.games g
using ranked r
where g.id = r.id
  and r.rn > 1
  and not exists (select 1 from public.game_diary_entries e where e.game_id = g.id)
  and not exists (select 1 from public.user_favorite_games f where f.game_id = g.id)
  and not exists (select 1 from public.game_screenshots s where s.game_id = g.id);

-- 2. La unicidad.
create unique index if not exists games_external_catalog_id_key
  on public.games (external_catalog_id);
