"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAX_BIO_LENGTH } from "@/lib/profile/constants";

export interface BioActionState {
  error: string | null;
  success: string | null;
}

const bioSchema = z
  .string()
  .trim()
  .max(MAX_BIO_LENGTH, `La bio tiene un máximo de ${MAX_BIO_LENGTH} caracteres.`);

/**
 * Guarda la bio del perfil (issue #196). Doble capa: el largo se valida acá y
 * en el `check` de `users.bio`, y la RLS `users_update_own` exige que la fila
 * sea la propia. Vacía = `null` (sin bio), no un string vacío.
 */
export async function saveBio(
  _prevState: BioActionState,
  formData: FormData,
): Promise<BioActionState> {
  const parsed = bioSchema.safeParse(String(formData.get("bio") ?? ""));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bio inválida.", success: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Volvé a iniciar sesión.", success: null };

  const { error } = await supabase
    .from("users")
    .update({ bio: parsed.data === "" ? null : parsed.data })
    .eq("id", user.id);
  if (error) return { error: "No se pudo guardar la bio. Probá de nuevo.", success: null };

  revalidatePath("/perfil");
  revalidatePath("/configuracion/perfil");
  return { error: null, success: "Bio guardada." };
}
