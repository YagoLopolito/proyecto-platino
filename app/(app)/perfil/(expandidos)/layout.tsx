import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Expandidos de Estadísticas del perfil propio (issue #196). Todos dependen de
 * la sesión: sin usuario, al login (el middleware ya cubre `/perfil`, esto es
 * la segunda capa).
 */
export default async function PerfilExpandidosLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return children;
}
