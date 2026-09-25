-- "Seguí jugando" (Recomendados para vos, Biblioteca › Juegos): el usuario
-- puede sacar un juego de la fila si decidió que no lo va a jugar más.
--
-- Guarda el `last_played_at` que tenía el juego al sacarlo (mismo criterio que
-- `play_suggestion_dismissed_at`): mientras el sync no traiga una sesión
-- posterior, el juego no aparece en "Seguí jugando" ni se le manda a la IA
-- como candidato. Si lo vuelve a jugar, vuelve solo.
--
-- Sin policy nueva: la escribe el dueño con `user_games_update_own`
-- (migración 20260901000000), y la Server Action filtra por `user_id` igual.
alter table public.user_games
  add column if not exists keep_playing_dismissed_at timestamptz;
