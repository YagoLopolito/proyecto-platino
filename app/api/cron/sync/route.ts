import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncTrophiesForUser, NpssoExpiredError } from "@/lib/psn";
import { mapWithConcurrency } from "@/lib/psn/concurrency";
import { syncSteamAchievementsForUser, SteamProfilePrivateError } from "@/lib/steam";
import { refreshSystemLists } from "@/lib/lists/system";
import { backfillGameCompanies } from "@/lib/studios/backfill";
import { isValidCronAuthorization } from "@/lib/cron/auth";
import { cleanupPosts } from "@/lib/posts/cleanup";
import { dbErrorMessage } from "@/lib/errors";

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
  return isValidCronAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET);
}

/**
 * El último paso de la corrida: recalcular las listas pregeneradas (#192).
 * Va en su propio try/catch: es un extra y no puede hacer fallar el sync, y
 * a la vez un sync que falla no tiene por qué dejar las listas sin refrescar.
 */
async function refreshSystemListsStep(supabase: ReturnType<typeof createServiceClient>) {
  try {
    return { ok: true as const, lists: await refreshSystemLists(supabase) };
  } catch (cause) {
    console.error("[cron] no se pudieron refrescar las listas pregeneradas", cause);
    // El detalle queda en el log: la respuesta no nombra tablas ni funciones (#165).
    return { ok: false as const, error: "No se pudieron refrescar las listas." };
  }
}

/**
 * Limpieza de la Galería online: posts abandonados en subida y archivos
 * huérfanos. Igual que las listas, en su propio try/catch: no puede hacer
 * fallar el sync ni depender de él.
 */
async function cleanupPostsStep(supabase: ReturnType<typeof createServiceClient>) {
  try {
    return { ok: true as const, ...(await cleanupPosts(supabase)) };
  } catch (cause) {
    console.error("[cron] no se pudo limpiar la galería", cause);
    return { ok: false as const, error: "No se pudo limpiar la galería." };
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createServiceClient();

  // `?paso=listas` corre sólo el refresco de las listas, sin sincronizar
  // ninguna cuenta: para dispararlo a mano (o desde los tests) sin pegarle a
  // PSN ni a Steam por cada usuario.
  if (request.nextUrl.searchParams.get("paso") === "listas") {
    return NextResponse.json({ systemLists: await refreshSystemListsStep(supabase) });
  }

  // `?paso=publicaciones` corre sólo la limpieza de la galería (tests y a mano).
  if (request.nextUrl.searchParams.get("paso") === "publicaciones") {
    return NextResponse.json({ posts: await cleanupPostsStep(supabase) });
  }

  // `?paso=estudios` completa los estudios de IGDB de una tanda de juegos
  // viejos (#193). No lo corre el cron diario: lo dispara a mano
  // `scripts/backfill-companies.mjs`, que repite hasta que no quede nada.
  if (request.nextUrl.searchParams.get("paso") === "estudios") {
    const size = Number(request.nextUrl.searchParams.get("tanda") ?? "40");
    const batch = Number.isInteger(size) && size > 0 && size <= 100 ? size : 40;
    return NextResponse.json({ companies: await backfillGameCompanies(supabase, batch) });
  }

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
    return NextResponse.json(
      { error: dbErrorMessage("cron.accounts", error, "No se pudieron leer las cuentas.") },
      { status: 500 },
    );
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
      return { platform: job.platform, ok: true as const, ...result };
    } catch (cause) {
      // El sync marca solo `token_status`/`profile_visibility` en la cuenta que
      // falló; acá solo se reporta, para que la corrida siga con las demás.
      // Sólo los dos estados conocidos se nombran en la respuesta; el resto
      // puede ser un error crudo de la base y va únicamente al log (#165).
      const message =
        cause instanceof NpssoExpiredError
          ? "NPSSO vencido."
          : cause instanceof SteamProfilePrivateError
            ? "Perfil de Steam en privado."
            : "Error inesperado.";
      // El userId va sólo al log del server, no a la respuesta (#133).
      console.error(`[cron] falló el sync ${job.platform} de ${job.userId}: ${message}`, cause);
      return { platform: job.platform, ok: false as const, error: message };
    }
  });

  const systemLists = await refreshSystemListsStep(supabase);
  const posts = await cleanupPostsStep(supabase);

  // Sólo conteos y errores: la respuesta no identifica a ningún usuario (#133).
  return NextResponse.json({
    systemLists,
    posts,
    accountsProcessed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
