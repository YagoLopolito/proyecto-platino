"use server";

import { createClient } from "@/lib/supabase/server";
import { getActivityPage, type ActivityPage } from "@/lib/activity/queries";
import type { ActivityTab } from "@/lib/activity/format";

const TABS: ActivityTab[] = ["amigos", "vos", "recibido"];

/** "Cargar más" de Actividad: la página siguiente al cursor, con el mismo filtro. */
export async function loadMoreActivity(
  tab: ActivityTab,
  cursor: string,
  tipo: string | null,
): Promise<ActivityPage> {
  if (!TABS.includes(tab)) return { status: "error", message: "Tab desconocida." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Tenés que iniciar sesión." };
  return getActivityPage(supabase, tab, cursor, tipo);
}
