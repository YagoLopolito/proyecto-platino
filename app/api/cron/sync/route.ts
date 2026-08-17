import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncTrophiesForUser, NpssoExpiredError } from "@/lib/psn";
import { mapWithConcurrency } from "@/lib/psn/concurrency";

/**
 * Igual límite que /api/psn/sync (ver CLAUDE.md): declarar maxDuration no
 * cambia el límite real de 60s en el plan Hobby de Vercel. Con muchas cuentas
 * conectadas esto puede necesitar Pro, o partir el trabajo en varias
 * invocaciones -- por ahora sincroniza todas las cuentas con token válido en
 * una sola corrida, con concurrencia limitada.
 */
export const maxDuration = 300;

const SYNC_CONCURRENCY = 3;

/** Vercel Cron manda `Authorization: Bearer ${CRON_SECRET}` en cada invocación programada. */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: accounts, error } = await supabase
    .from("psn_accounts")
    .select("user_id")
    .eq("token_status", "valid");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await mapWithConcurrency(accounts ?? [], SYNC_CONCURRENCY, async (account) => {
    try {
      const result = await syncTrophiesForUser(supabase, account.user_id);
      return { userId: account.user_id, ok: true as const, ...result };
    } catch (cause) {
      const message =
        cause instanceof NpssoExpiredError
          ? "NPSSO vencido."
          : cause instanceof Error
            ? cause.message
            : "Error inesperado.";
      return { userId: account.user_id, ok: false as const, error: message };
    }
  });

  return NextResponse.json({
    accountsProcessed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
