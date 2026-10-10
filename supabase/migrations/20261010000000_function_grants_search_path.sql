-- Hallazgos de get_advisors (security), issue #223.
--
-- 1) handle_new_user() es SECURITY DEFINER y quedaba ejecutable por anon y
--    authenticated vía /rest/v1/rpc/handle_new_user. La migración original
--    (20260816120000) revocaba EXECUTE de anon y authenticated, pero no de
--    PUBLIC: Postgres le da EXECUTE a PUBLIC por defecto al crear una función,
--    y los dos roles lo heredaban de ahí. Es un trigger: nadie tiene que
--    llamarlo por RPC, y un trigger se dispara igual sin ese grant.
--
-- 2) activity_is_user_entry() no fijaba search_path. No lee ninguna tabla
--    (sólo campos del registro que recibe), así que '' alcanza y no hay nada
--    que resolver por nombre.

revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter function public.activity_is_user_entry(public.game_diary_entries) set search_path = '';

-- ROLLBACK
-- grant execute on function public.handle_new_user() to public;
-- alter function public.activity_is_user_entry(public.game_diary_entries) reset search_path;
