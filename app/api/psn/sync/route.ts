import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncTrophiesForUser, NpssoExpiredError } from "@/lib/psn";
import { PSN_SYNC_COOLDOWN_MS, cooldownRemainingMs, formatCooldown } from "@/lib/sync/cooldown";

/**
 * Sincronizar puede tardar bastante con bibliotecas grandes (varias decenas
 * de juegos, cada uno con su propia consulta a la API de PSN). En el plan
 * Hobby de Vercel el límite real sigue siendo 60s aunque se pida más; en
 * Pro/Enterprise esto sí extiende el timeout.
 */
export const maxDuration = 300;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 });
  }

  // Freno de frecuencia (#128): cada sync son decenas de requests a la API
  // interna de Sony desde IPs de Vercel, el patrón por el que bloquea IPs o
  // invalida tokens. El cron no pasa por esta ruta y no queda sujeto al límite.
  const { data: account } = await supabase
    .from("psn_accounts")
    .select("last_synced_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const remainingMs = cooldownRemainingMs(account?.last_synced_at, PSN_SYNC_COOLDOWN_MS);
  if (remainingMs > 0) {
    const retryAfterSeconds = Math.ceil(remainingMs / 1000);
    return NextResponse.json(
      {
        error: `Ya sincronizaste hace poco. Podés volver a hacerlo en ${formatCooldown(remainingMs)}.`,
        retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  try {
    const result = await syncTrophiesForUser(supabase, user.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NpssoExpiredError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Error inesperado al sincronizar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
