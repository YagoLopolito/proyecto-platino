import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncTrophiesForUser, NpssoExpiredError } from "@/lib/psn";

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
    if (error instanceof NpssoExpiredError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Error inesperado al sincronizar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
