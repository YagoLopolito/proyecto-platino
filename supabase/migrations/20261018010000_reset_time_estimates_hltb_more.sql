-- La tabla de referencia de HowLongToBeat (`lib/time-to-beat/reference.ts`)
-- pasó de ~150 a ~280 juegos. Los que se abrieron desde la migración anterior
-- y no estaban en la tabla quedaron cacheados con IGDB, la IA o `none`: se
-- borran para que la próxima visita tome el tiempo de la tabla. Los `hltb` ya
-- están bien y no se tocan.
update public.games
set time_to_beat_minutes = null,
    time_to_complete_minutes = null,
    time_estimates_source = null,
    time_estimates_checked_at = null
where time_estimates_checked_at is not null
  and time_estimates_source is distinct from 'hltb';
