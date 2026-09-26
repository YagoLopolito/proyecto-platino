-- Issue #129: las policies de select sin `to <rol>` aplican a PUBLIC, o sea
-- también a `anon`. La anon key viaja en el bundle público, así que cualquiera
-- podía bajarse estas tablas enteras sin cuenta (incluidos los uuid de
-- usuarios en `created_by` / `author_id` / `user_id`).
--
-- Ninguna ruta pública lee estas tablas: todo lo que las consulta está detrás
-- de sesión (middleware + validación por página), y el cron usa service role.
--
-- `alter policy ... to authenticated` conserva la condición `using` tal cual:
-- para quien tiene sesión no cambia nada. El issue listaba 6 tablas; desde
-- entonces se sumaron otras con el mismo patrón (diario, likes, playlist,
-- listas, estudios...) y se cierran todas juntas.
--
-- `ai_game_plans` NO se toca (su condición ya depende de auth.uid()), igual que
-- las policies "sólo el dueño": con anon, auth.uid() es null y no devuelven nada.

alter policy games_select_all on public.games to authenticated;
alter policy trophies_select_all on public.trophies to authenticated;
alter policy trophy_groups_select_all on public.trophy_groups to authenticated;
alter policy guides_select_all on public.guides to authenticated;
alter policy guide_steps_select_all on public.guide_steps to authenticated;
alter policy game_external_guides_select_all on public.game_external_guides to authenticated;
alter policy game_diary_entries_select_all on public.game_diary_entries to authenticated;
alter policy game_screenshots_select_all on public.game_screenshots to authenticated;
alter policy user_favorite_games_select_all on public.user_favorite_games to authenticated;
alter policy now_playing_select_all on public.now_playing to authenticated;
alter policy user_playlist_select_all on public.user_playlist to authenticated;
alter policy review_likes_select_all on public.review_likes to authenticated;
alter policy companies_select_all on public.companies to authenticated;
alter policy game_companies_select_all on public.game_companies to authenticated;
alter policy user_lists_select_visible on public.user_lists to authenticated;
alter policy user_list_items_select_visible on public.user_list_items to authenticated;
alter policy list_likes_select_visible on public.list_likes to authenticated;

-- ROLLBACK
-- alter policy games_select_all on public.games to public;
-- alter policy trophies_select_all on public.trophies to public;
-- alter policy trophy_groups_select_all on public.trophy_groups to public;
-- alter policy guides_select_all on public.guides to public;
-- alter policy guide_steps_select_all on public.guide_steps to public;
-- alter policy game_external_guides_select_all on public.game_external_guides to public;
-- alter policy game_diary_entries_select_all on public.game_diary_entries to public;
-- alter policy game_screenshots_select_all on public.game_screenshots to public;
-- alter policy user_favorite_games_select_all on public.user_favorite_games to public;
-- alter policy now_playing_select_all on public.now_playing to public;
-- alter policy user_playlist_select_all on public.user_playlist to public;
-- alter policy review_likes_select_all on public.review_likes to public;
-- alter policy companies_select_all on public.companies to public;
-- alter policy game_companies_select_all on public.game_companies to public;
-- alter policy user_lists_select_visible on public.user_lists to public;
-- alter policy user_list_items_select_visible on public.user_list_items to public;
-- alter policy list_likes_select_visible on public.list_likes to public;
