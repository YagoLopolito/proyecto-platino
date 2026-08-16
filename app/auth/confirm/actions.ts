"use server";

import { redirect } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function confirmSignup(formData: FormData) {
  const token_hash = formData.get("token_hash") as string;
  const type = formData.get("type") as EmailOtpType;
  const next = (formData.get("next") as string) || "/perfil";

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    redirect("/login?error=confirmacion_invalida");
  }

  redirect(next);
}
