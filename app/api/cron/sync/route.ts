import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncTrophiesForUser, NpssoExpiredError } from "@/lib/psn";
import { mapWithConcurrency } from "@/lib/psn/concurrency";
import { syncSteamAchievementsForUser, SteamProfilePrivateError } from "@/lib/steam";

/**
 * Igual límite que /api/psn/sync (ver CLAUDE.md): declarar maxDuration no
 * cambia el límite real de 60s en el plan Hobby de Vercel. Con muchas cuentas
 * conectadas esto puede necesitar Pro, o partir el trabajo en varias
 * invocaciones -- por ahora sincroniza todas las cuentas con token válido en
 * una sola corrida, con concurrencia limitada.
 *
 * Las dos plataformas comparten este endpoint a propósito: el plan Hobby limita
 * la cantidad de cron jobs, y el trabajo es el mismo con otra fuente. Con dos
 * plataformas conectadas la corrida hace bastante más trabajo, así que vale
 * medir cuánto tarda con las cuentas reales antes de asumir que entra.
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

  const [{ data: psnAccounts, error: psnError }, { data: steamAccounts, error: steamError }] =
    await Promise.all([
      supabase.from("psn_accounts").select("user_id").eq("token_status", "valid"),
      // Las cuentas con el perfil ya en privado se saltean: el sync no puede
      // traer nada hasta que el usuario cambie la configuración en Steam, y la
      // UI ya se lo está pidiendo.
      supabase.from("steam_accounts").select("user_id").eq("profile_visibility", "public"),
    ]);

  const error = psnError ?? steamError;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Una plataforma por cuenta y por entrada: si una falla, no puede tirar abajo
  // ni a las demás cuentas ni a la otra plataforma de la misma cuenta.
  const jobs = [
    ...(psnAccounts ?? []).map((account) => ({
      userId: account.user_id,
      platform: "psn" as const,
    })),
    ...(steamAccounts ?? []).map((account) => ({
      userId: account.user_id,
      platform: "steam" as const,
    })),
  ];

  const results = await mapWithConcurrency(jobs, SYNC_CONCURRENCY, async (job) => {
    try {
      const result =
        job.platform === "psn"
          ? await syncTrophiesForUser(supabase, job.userId)
          : await syncSteamAchievementsForUser(supabase, job.userId);
      return { userId: job.userId, platform: job.platform, ok: true as const, ...result };
    } catch (cause) {
      // El sync marca solo `token_status`/`profile_visibility` en la cuenta que
      // falló; acá solo se reporta, para que la corrida siga con las demás.
      const message =
        cause instanceof NpssoExpiredError
          ? "NPSSO vencido."
          : cause instanceof SteamProfilePrivateError
            ? "Perfil de Steam en privado."
            : cause instanceof Error
              ? cause.message
              : "Error inesperado.";
      return { userId: job.userId, platform: job.platform, ok: false as const, error: message };
    }
  });

  return NextResponse.json({
    accountsProcessed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
