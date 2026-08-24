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
    // El detalle real solo va a los logs del server (Vercel): distinguir
    // "Invalid login credentials" de "Email not confirmed" o de un rate limit
    // en pantalla permitiría enumerar cuentas.
    console.error("[auth] login failed", {
      name: error.name,
      status: error.status,
      message: error.message,
    });
    // Mensaje genérico a propósito: no filtra si el fallo fue por password
    // incorrecta o por un email inexistente (AUTH-04/AUTH-05 de TESTING_PRD.md).
    return { error: "Email o contraseña incorrectos." };
  }

  redirect("/perfil");
}
