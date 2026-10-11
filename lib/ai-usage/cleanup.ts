import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { TROPHY_HINT_LIMITS } from "@/lib/sync/cooldown";

/**
 * Las filas de `ai_usage` sólo sirven mientras están dentro de alguna ventana
 * de `claim_ai_usage` (#235). Se guardan el doble de la más larga, de margen,
 * y el resto lo borra el cron: si no, la tabla crece con cada ayuda pedida.
 * Necesita service role (`authenticated` no borra en `ai_usage`).
 */
const RETENTION_MS = 2 * Math.max(...TROPHY_HINT_LIMITS.map((limit) => limit.windowMs));

export async function cleanupAiUsage(
  supabase: SupabaseClient<Database>,
  now: number = Date.now(),
): Promise<{ deleted: number }> {
  const { count, error } = await supabase
    .from("ai_usage")
    .delete({ count: "exact" })
    .lt("created_at", new Date(now - RETENTION_MS).toISOString());
  if (error) throw error;
  return { deleted: count ?? 0 };
}
