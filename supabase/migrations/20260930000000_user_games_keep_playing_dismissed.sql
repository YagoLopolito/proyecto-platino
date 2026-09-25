-- "Seguí jugando" (Recomendados para vos, Biblioteca › Juegos): el usuario
-- puede sacar un juego de la fila si decidió que no lo va a jugar más.
--
-- Es una marca por juego de la biblioteca, no por generación: el juego no
-- vuelve a aparecer en "Seguí jugando" (se filtra al mostrar) ni se le manda
-- a la IA como candidato la próxima vez que se generen recomendaciones.
--
-- Sin policy nueva: la escribe el dueño con `user_games_update_own`
-- (migración 20260901000000), y la Server Action filtra por `user_id` igual.
alter table public.user_games
  add column if not exists keep_playing_dismissed_at timestamptz;
