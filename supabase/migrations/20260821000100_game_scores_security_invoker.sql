-- Postgres views default to SECURITY DEFINER semantics (run with the view owner's
-- privileges) unless security_invoker is set -- the linter flags this as an ERROR.
-- Match the invoker style already used by get_library_trophy_stats.
alter view public.game_scores set (security_invoker = true);
