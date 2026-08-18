"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error: string | null;
};

export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // DEBUG TEMPORAL: mostramos el mensaje real de Supabase para diagnosticar
    // un login que fallaba sin llegar a los logs de auth. Revertir a
    // "Email o contraseña incorrectos." una vez resuelto.
    return { error: `[DEBUG] ${error.name}: ${error.message} (status ${error.status ?? "?"})` };
  }

  redirect("/perfil");
}
