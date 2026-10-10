-- Issue #235: freno de frecuencia para `explainTrophy` (la ayuda de un trofeo
-- con IA).
--
-- La ayuda no se guarda en ningún lado, así que no había una marca persistida
-- de la cual colgar el freno, como `last_synced_at` en el sync o
-- `ai_game_plans.created_at` en el plan. El free tier de Groq es por
-- organización (30 req/min): un usuario en loop dejaba el advisor caído para
-- todos. Cada pedido deja una fila acá ANTES de llamar al proveedor, y la
-- Server Action cuenta las de la última ventana (`lib/sync/cooldown.ts`).
--
-- `kind` deja lugar a otros usos de IA sin marca propia; hoy sólo existe la
-- ayuda de trofeo. Sin policies de update/delete a propósito: borrar las filas
-- propias sería resetear el freno.

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('trophy_hint')),
  created_at timestamptz not null default now()
);

create index ai_usage_user_kind_created_idx
  on public.ai_usage (user_id, kind, created_at desc);

alter table public.ai_usage enable row level security;

create policy "ai_usage_select_own"
  on public.ai_usage for select
  to authenticated
  using (auth.uid() = user_id);

create policy "ai_usage_insert_own"
  on public.ai_usage for insert
  to authenticated
  with check (auth.uid() = user_id);

revoke all on public.ai_usage from anon;
revoke update, delete on public.ai_usage from authenticated;

-- ROLLBACK
-- drop table if exists public.ai_usage;
