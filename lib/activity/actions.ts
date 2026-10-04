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

/**
 * Cuántas cosas llegaron a Recibido desde la última vez que lo abriste (el
 * globito de Actividad). Cualquier error es 0: es un adorno, no puede romper
 * la navegación.
 */
export async function getUnreadActivityCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data, error } = await supabase.rpc("count_unread_received");
  return error || typeof data !== "number" ? 0 : data;
}

/** Abrir Recibido marca todo como leído. */
export async function markReceivedSeen(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.rpc("mark_received_seen");
}
