-- Los tiempos estimados se consultaban a `game_time_to_beat` (singular), un
-- endpoint de IGDB que no existe: ningún juego salió nunca de IGDB y todo lo
-- cacheado es estimación de IA o `none`. Con el endpoint corregido
-- (`game_time_to_beats`, historia = `hastily`) se borra el caché para que
-- cada ficha vuelva a consultar en su próxima visita.
update public.games
set time_to_beat_minutes = null,
    time_to_complete_minutes = null,
    time_estimates_source = null,
    time_estimates_checked_at = null
where time_estimates_source in ('ai', 'none');
