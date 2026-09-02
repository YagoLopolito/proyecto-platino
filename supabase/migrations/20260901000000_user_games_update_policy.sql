-- `user_games` tenía policies de select/insert/delete desde
-- 20260816121000_manual_entry_support.sql, pero NUNCA una de update.
--
-- El sync escribe la fila con un upsert (`onConflict: "user_id,game_id"`): la
-- primera vez entra por el INSERT y funciona, pero de ahí en adelante el
-- ON CONFLICT DO UPDATE lo rechaza la RLS. O sea que `last_played_at` y
-- `playtime_minutes` sólo se escribían una vez en la vida de cada fila y
-- después quedaban congelados. En la biblioteca real del usuario eso daba 3
-- juegos con horas sobre 368: los únicos cuya fila se insertó después de que
-- existiera la columna.
--
-- Es la política que faltaba, con el mismo criterio que las otras tres: el
-- dueño de la fila y nadie más. El `with check` además impide reasignarle la
-- fila a otro usuario en el update.
create policy "user_games_update_own"
  on public.user_games for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
