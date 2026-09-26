-- Issue #130 (paso 2): `npsso_encrypted` deja de ser legible con la anon key.
-- Es ciphertext y sin PSN_TOKEN_ENCRYPTION_KEY no sirve, pero no hay razón para
-- que un XSS o una extensión puedan llevárselo.
--
-- ORDEN DE DEPLOY: aplicar recién DESPUÉS de desplegar el PR que mueve la
-- lectura y el upsert del NPSSO al service client (lib/psn/sync.ts y
-- configuracion/conexiones/actions.ts). Antes de eso, el sync manual y
-- "conectar cuenta" se rompen para todos.
--
-- Un `revoke select (npsso_encrypted)` a secas NO alcanza: Supabase da SELECT
-- a nivel tabla, y en Postgres revocar una columna no tiene efecto mientras
-- exista el grant de la tabla (verificado: has_column_privilege seguía en
-- true). Por eso se revoca la tabla y se vuelve a dar SELECT columna por
-- columna, sin la del NPSSO. Una columna nueva en psn_accounts que la app
-- tenga que leer necesita su propio `grant select (col)`.
-- `anon` no recibe nada: no tiene sesión y la policy es "sólo el dueño".

revoke select on public.psn_accounts from authenticated, anon;

grant select (
  id, user_id, online_id, account_id, token_status, last_synced_at, created_at,
  updated_at, avatar_url, trophy_level, trophy_progress, trophy_tier,
  earned_platinum, earned_gold, earned_silver, earned_bronze
) on public.psn_accounts to authenticated;

-- ROLLBACK
-- revoke select (
--   id, user_id, online_id, account_id, token_status, last_synced_at, created_at,
--   updated_at, avatar_url, trophy_level, trophy_progress, trophy_tier,
--   earned_platinum, earned_gold, earned_silver, earned_bronze
-- ) on public.psn_accounts from authenticated;
-- grant select on public.psn_accounts to authenticated, anon;
