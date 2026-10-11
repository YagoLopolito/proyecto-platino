-- Issue #235: freno de frecuencia para `explainTrophy` (la ayuda de un trofeo
-- con IA).
--
-- La ayuda no se guarda en ningún lado, así que no había una marca persistida
-- de la cual colgar el freno, como `last_synced_at` en el sync o
-- `ai_game_plans.created_at` en el plan. El free tier de Groq es por
-- organización (30 req/min): un usuario en loop dejaba el advisor caído para
-- todos. Cada pedido deja una fila acá ANTES de llamar al proveedor.
--
-- Contar y anotar es UNA operación: `claim_ai_usage`, con un lock por usuario y
-- tipo. Hecho como dos consultas desde la Server Action, N pedidos en paralelo
-- leían el mismo conteo y pasaban todos. `authenticated` no inserta directo:
-- así `created_at` es siempre `now()` y nadie arma su propia ventana.
--
-- `kind` deja lugar a otros usos de IA sin marca propia; hoy sólo existe la
-- ayuda de trofeo. Sin update/delete: borrar las filas propias sería resetear
-- el freno. El cron borra las de más de 2 días (la ventana más larga es 1).

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

revoke all on public.ai_usage from anon;
revoke insert, update, delete on public.ai_usage from authenticated;

-- Devuelve los milisegundos que faltan para que entre un pedido sin pasar
-- ningún tope, o 0 si entró (y en ese caso ya quedó anotado). Los topes llegan
-- del código (`TROPHY_HINT_LIMITS` en lib/sync/cooldown.ts), como las
-- constantes de `refresh_system_lists`: el tope `i` es como mucho
-- `p_max[i]` pedidos en los últimos `p_window_seconds[i]` segundos.
create function public.claim_ai_usage(
  p_kind text,
  p_window_seconds integer[],
  p_max integer[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_wait_ms double precision := 0;
  v_nth timestamptz;
  i integer;
begin
  if v_user is null then
    raise exception 'claim_ai_usage: sin sesión' using errcode = '42501';
  end if;
  if coalesce(array_length(p_max, 1), 0) = 0
     or array_length(p_window_seconds, 1) is distinct from array_length(p_max, 1) then
    raise exception 'claim_ai_usage: topes inválidos' using errcode = '22023';
  end if;

  -- Serializa los pedidos del mismo usuario y tipo hasta el commit.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_kind, 0));

  for i in 1 .. array_length(p_max, 1) loop
    if p_window_seconds[i] is null or p_window_seconds[i] <= 0
       or p_max[i] is null or p_max[i] <= 0 then
      raise exception 'claim_ai_usage: topes inválidos' using errcode = '22023';
    end if;

    -- El `p_max[i]`-ésimo más reciente dentro de la ventana: entra uno nuevo
    -- cuando ese sale de la ventana.
    v_nth := null;
    select u.created_at into v_nth
    from public.ai_usage u
    where u.user_id = v_user
      and u.kind = p_kind
      and u.created_at > now() - make_interval(secs => p_window_seconds[i])
    order by u.created_at desc
    offset p_max[i] - 1
    limit 1;

    if v_nth is not null then
      v_wait_ms := greatest(
        v_wait_ms,
        extract(epoch from (v_nth + make_interval(secs => p_window_seconds[i]) - now())) * 1000
      );
    end if;
  end loop;

  if v_wait_ms > 0 then
    return greatest(1, ceil(v_wait_ms))::integer;
  end if;

  insert into public.ai_usage (user_id, kind) values (v_user, p_kind);
  return 0;
end;
$$;

revoke execute on function public.claim_ai_usage(text, integer[], integer[]) from public, anon;
grant execute on function public.claim_ai_usage(text, integer[], integer[]) to authenticated;

-- ROLLBACK
-- drop function if exists public.claim_ai_usage(text, integer[], integer[]);
-- drop table if exists public.ai_usage;
