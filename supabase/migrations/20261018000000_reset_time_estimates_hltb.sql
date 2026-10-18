-- Los tiempos estimados cacheados no coincidían con HowLongToBeat: los de IGDB
-- salen de pocas partidas (348 h de historia en DRAGON BALL Z: KAKAROT, más de
-- 15.000 h en League of Legends) y los de la IA subestiman casi todo. Ahora la
-- primera fuente es la tabla de referencia de HLTB (`lib/time-to-beat/reference.ts`)
-- y a IGDB se le aplica un tope de cordura, así que se borra todo el caché
-- para que cada ficha recalcule en su próxima visita. Incluye los `none`:
-- varios juegos que ni IGDB ni la IA conocían ahora están en la tabla.
update public.games
set time_to_beat_minutes = null,
    time_to_complete_minutes = null,
    time_estimates_source = null,
    time_estimates_checked_at = null
where time_estimates_checked_at is not null;

comment on column public.games.time_estimates_source is
  'De dónde salieron los tiempos estimados: hltb (tabla de referencia de HowLongToBeat), igdb, ai o none.';
