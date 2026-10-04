import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Globito de Actividad: cuántas cosas llegaron a Recibido desde la última vez
 * que lo abriste (GET), y marcarlas como vistas (POST).
 *
 * Es un route handler y no una Server Action a propósito: el provider lo pide
 * en CADA navegación, y las Server Actions comparten una fila en el router de
 * Next. Una action acá dejaba esperando a las de la pantalla (marcar como
 * jugando, buscar guías) y su respuesta re-renderizaba la página en el medio
 * de lo que el usuario estaba haciendo. Un `fetch` común no toca el router.
 */
export const dynamic = "force-dynamic";

async function sessionClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

export async function GET() {
  const supabase = await sessionClient();
  if (!supabase) return NextResponse.json({ count: 0 }, { status: 401 });
  const { data, error } = await supabase.rpc("count_unread_received");
  // Es un adorno: cualquier error es 0, nunca una pantalla rota.
  return NextResponse.json(
    { count: error || typeof data !== "number" ? 0 : data },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST() {
  const supabase = await sessionClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 401 });
  await supabase.rpc("mark_received_seen");
  return NextResponse.json({ ok: true });
}
