import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPendingCelebrations, getPlatinumPrefs } from "@/lib/platinum/queries";
import { DEFAULT_PLATINUM_PREFS, type PlatinumState } from "@/lib/platinum/types";

/**
 * Lo que necesita el `PlatinumProvider` del layout: las preferencias de efectos
 * y sonido, y los platinos nuevos todavía sin celebrar.
 *
 * Route handler y no Server Action por lo mismo que `/api/actividad/no-leidas`:
 * lo pide un componente montado en todas las pantallas, y una action ocuparía
 * la fila de actions del router de Next justo cuando el usuario quiere usar las
 * de la pantalla.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const empty: PlatinumState = { prefs: DEFAULT_PLATINUM_PREFS, pending: [] };
    return NextResponse.json(empty, { status: 401 });
  }

  const [prefs, pending] = await Promise.all([
    getPlatinumPrefs(supabase, user.id),
    getPendingCelebrations(supabase, user.id),
  ]);
  const state: PlatinumState = { prefs, pending };
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
