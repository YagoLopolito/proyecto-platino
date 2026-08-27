import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  syncSteamAchievementsForUser,
  SteamApiError,
  SteamProfilePrivateError,
} from "@/lib/steam";

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

  try {
    const result = await syncSteamAchievementsForUser(supabase, user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[steam-sync] falló el sync manual:", error);
    // El perfil en privado no es un error de la app ni de Steam: es una opción
    // de privacidad que solo el usuario puede cambiar. Va con su propio código
    // para que la UI muestre las instrucciones en vez de "probá más tarde".
    if (error instanceof SteamProfilePrivateError) {
      return NextResponse.json({ error: error.message, reason: "private" }, { status: 409 });
    }
    const message =
      error instanceof SteamApiError
        ? error.message
        : "Error inesperado al sincronizar con Steam.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
