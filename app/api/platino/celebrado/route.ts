import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { markCelebrated } from "@/lib/platinum/queries";

/**
 * Marca un platino como ya celebrado. Del lado del servidor y no en
 * localStorage: así la celebración no se repite en otro dispositivo ni al
 * limpiar el navegador. Route handler por la misma razón que `../estado`.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({ userTrophyId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const ok = await markCelebrated(supabase, user.id, parsed.data.userTrophyId);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
