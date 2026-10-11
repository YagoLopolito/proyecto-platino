-- Issue #160: `guides` y `guide_steps` pasan a ser de sólo lectura para
-- `authenticated`.
--
-- La UI de alta de guías se borró, pero las policies seguían dejando que
-- cualquier usuario logueado insertara por PostgREST una guía en cualquier
-- juego. Esa fila aparecía en `/juegos/[id]/guias` para todos (un enlace con
-- título "Guía oficial del platino" a un dominio propio) y llegaba al prompt
-- del advisor (eso ya lo cortó #132 filtrando por autor; esto cierra la
-- puerta de entrada). Si la funcionalidad vuelve, se escribe con service role
-- o se recrean estas policies junto con su Server Action.

drop policy if exists "guides_insert_own" on public.guides;
drop policy if exists "guides_update_own" on public.guides;
drop policy if exists "guides_delete_own" on public.guides;

drop policy if exists "guide_steps_insert_own" on public.guide_steps;
drop policy if exists "guide_steps_update_own" on public.guide_steps;
drop policy if exists "guide_steps_delete_own" on public.guide_steps;

-- Sin policies alcanza (RLS niega por defecto), pero sin el grant tampoco hay
-- error de permisos ambiguo: PostgREST contesta 401/403 en vez de 0 filas.
revoke insert, update, delete on public.guides from anon, authenticated;
revoke insert, update, delete on public.guide_steps from anon, authenticated;

-- ROLLBACK
-- grant insert, update, delete on public.guides to authenticated;
-- grant insert, update, delete on public.guide_steps to authenticated;
-- create policy "guides_insert_own" on public.guides for insert
--   with check (auth.uid() = author_id);
-- create policy "guides_update_own" on public.guides for update
--   using (auth.uid() = author_id);
-- create policy "guides_delete_own" on public.guides for delete
--   using (auth.uid() = author_id);
-- create policy "guide_steps_insert_own" on public.guide_steps for insert
--   with check (exists (select 1 from public.guides
--     where guides.id = guide_steps.guide_id and guides.author_id = auth.uid()));
-- create policy "guide_steps_update_own" on public.guide_steps for update
--   using (exists (select 1 from public.guides
--     where guides.id = guide_steps.guide_id and guides.author_id = auth.uid()));
-- create policy "guide_steps_delete_own" on public.guide_steps for delete
--   using (exists (select 1 from public.guides
--     where guides.id = guide_steps.guide_id and guides.author_id = auth.uid()));
