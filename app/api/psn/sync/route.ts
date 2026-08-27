import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncTrophiesForUser, NpssoExpiredError } from "@/lib/psn";

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

  try {
    const result = await syncTrophiesForUser(supabase, user.id);
    return NextResponse.json(result);
  } catch (error) {
    // El detalle solo va al log del servidor: al cliente sigue yendo un
    // mensaje acotado. Sin esto, un sync que falla temprano (NPSSO cifrado con
    // otra clave, PSN caída) queda como un 500 mudo imposible de diagnosticar.
    console.error("[psn-sync] falló el sync manual:", error);
    if (error instanceof NpssoExpiredError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Error inesperado al sincronizar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
