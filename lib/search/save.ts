import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { MAX_QUERY_LENGTH, MAX_RECENT_SEARCHES, SEARCH_SCOPES, type SearchScope } from "./scopes";

const saveSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  scope: z.enum(SEARCH_SCOPES),
});

/**
 * Guarda una búsqueda en recientes: repetirla sólo actualiza la fecha, y
 * `save_recent_search` borra las que pasen del tope. Nunca tira: una reciente
 * que no se guardó no puede impedir abrir el resultado.
 */
export async function saveRecentSearch(
  supabase: SupabaseClient<Database>,
  query: string,
  scope: SearchScope,
): Promise<void> {
  const parsed = saveSchema.safeParse({ query, scope });
  if (!parsed.success) return;
  const { error } = await supabase.rpc("save_recent_search", {
    p_query: parsed.data.query,
    p_scope: parsed.data.scope,
    p_max: MAX_RECENT_SEARCHES,
  });
  if (error) console.error(`[buscar] no se pudo guardar la búsqueda reciente: ${error.message}`);
}
