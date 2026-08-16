"use server";

import { createClient } from "@/lib/supabase/server";
import type { AuthActionState } from "@/app/login/actions";

export async function signup(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: "No se pudo crear la cuenta. ¿Ya existe ese email?" };
  }

  return { error: null };
}
