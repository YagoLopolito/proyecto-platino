import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStudioProfile } from "./store";

/**
 * Perfil de estudio del request, compartido por el layout y las tabs de
 * `/estudios/[slug]` con `cache()` (mismo patrón que `lib/game-page/data.ts`).
 */
export const getStudioPage = cache(async (slug: string) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getStudioProfile(supabase, decodeURIComponent(slug));
  if (profile === null) notFound();
  return { supabase, userId: user.id, profile };
});
