"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRecentSearches } from "./queries";
import type { RecentSearch } from "./scopes";

/**
 * Server Actions de las búsquedas recientes (issue #194). Guardar no está
 * acá: va por `/buscar/ir`, ver ese route handler.
 */

/** Las recientes de quien mira, para el popover del header (se piden al enfocar). */
export async function getMyRecentSearches(): Promise<RecentSearch[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return getRecentSearches(supabase, user.id);
}

/** Borra una reciente. La RLS ya exige que sea tuya; el `eq` lo dice también. */
export async function deleteRecentSearch(formData: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("recent_searches").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/buscar");
}

/** "Borrar todo". */
export async function clearRecentSearches(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("recent_searches").delete().eq("user_id", user.id);
  revalidatePath("/buscar");
}
