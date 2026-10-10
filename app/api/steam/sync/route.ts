import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSteamAchievementsForUser, SteamApiError, SteamProfilePrivateError } from "@/lib/steam";
import { STEAM_SYNC_COOLDOWN_MS, cooldownRemainingMs, formatCooldown } from "@/lib/sync/cooldown";

/**
 * Espejo de /api/psn/sync: va como API route y no como Server Action porque
 * necesita declarar `maxDuration`. Una biblioteca de Steam puede tener cientos
 * de títulos y cada uno son hasta 3 llamadas (schema + logros + rareza); en el
 * plan Hobby de Vercel el límite real siguen siendo 60s pase lo que declare la
 * ruta.
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

  // Freno de frecuencia (#159), espejo del de PSN (#128): la cuota de la
  // STEAM_API_KEY es de toda la app. El cron no pasa por esta ruta.
  const { data: account } = await supabase
    .from("steam_accounts")
    .select("last_synced_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const remainingMs = cooldownRemainingMs(account?.last_synced_at, STEAM_SYNC_COOLDOWN_MS);
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
    const result = await syncSteamAchievementsForUser(supabase, user.id);
    return NextResponse.json(result);
  } catch (error) {
    // El perfil en privado no es un error de la app ni de Steam: es una opción
    // de privacidad que solo el usuario puede cambiar. Va con su propio código
    // para que la UI muestre las instrucciones en vez de "probá más tarde".
    if (error instanceof SteamProfilePrivateError) {
      return NextResponse.json({ error: error.message, reason: "private" }, { status: 409 });
    }
    const message =
      error instanceof SteamApiError ? error.message : "Error inesperado al sincronizar con Steam.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
