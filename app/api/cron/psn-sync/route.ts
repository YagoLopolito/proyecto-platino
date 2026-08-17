import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncTrophiesForUser, NpssoExpiredError } from "@/lib/psn";
import { mapWithConcurrency } from "@/lib/psn/concurrency";

/**
 * Igual límite que /api/psn/sync: se declara 300 pero en el plan Hobby de
 * Vercel el real sigue siendo 60s. Acá además se sincronizan TODAS las
 * cuentas conectadas, así que en Hobby esto va a necesitar Pro/Enterprise
 * (o un cron más frecuente que vaya avanzando) para no cortarse a mitad.
 */
export const maxDuration = 300;

/** Cuántas cuentas se sincronizan en simultáneo. */
const ACCOUNT_SYNC_CONCURRENCY = 2;

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
    .neq("token_status", "expired");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await mapWithConcurrency(
    accounts ?? [],
    ACCOUNT_SYNC_CONCURRENCY,
    async (account) => {
      try {
        const result = await syncTrophiesForUser(supabase, account.user_id);
        return { userId: account.user_id, ok: true as const, ...result };
      } catch (cause) {
        const message =
          cause instanceof NpssoExpiredError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "Error inesperado.";
        return { userId: account.user_id, ok: false as const, error: message };
      }
    },
  );

  return NextResponse.json({
    accountsProcessed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
