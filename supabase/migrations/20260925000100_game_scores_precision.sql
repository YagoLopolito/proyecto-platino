-- `game_scores` casteaba el promedio a numeric(3, 2), que llega hasta 9.99: un
-- juego cuyas valoraciones eran todas 10 hacía fallar la vista entera con
-- "numeric field overflow" (la ficha, el histograma y, desde #192, el cálculo
-- de las listas pregeneradas). numeric(4, 2) cubre el 10.00.
--
-- Se dropea y se recrea: `create or replace view` no puede cambiar el tipo de
-- una columna. Misma definición, `security_invoker` y grants que antes.
drop view public.game_scores;

create view public.game_scores
with (security_invoker = true) as
with latest_entry as (
  select distinct on (game_id, user_id) game_id, user_id, rating
  from public.game_diary_entries
  where rating is not null
  order by game_id, user_id, playthrough_number desc
)
select
  game_id,
  avg(rating)::numeric(4, 2) as average_rating,
  count(*) as rating_count
from latest_entry
group by game_id;

grant select on public.game_scores to authenticated;
