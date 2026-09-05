import { NextResponse } from "next/server";
import { getBuildId } from "@/lib/pwa/build-id";

/**
 * Devuelve el build id del deploy que está corriendo ahora mismo. La app
 * instalada lo consulta cada tanto y, si no coincide con el que trae su propio
 * bundle, ofrece actualizar (ver `components/pwa/PwaRuntime.tsx`).
 *
 * `force-dynamic` + `no-store`: si esto se cachea, la app nunca se entera de
 * un deploy nuevo, que es justo lo único que hace este endpoint.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { buildId: getBuildId() },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
