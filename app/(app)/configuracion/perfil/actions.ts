"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAX_BIO_LENGTH, PROFILE_PLATFORMS } from "@/lib/profile/constants";

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

export interface ProfilePlatformActionState {
  error: string | null;
  success: string | null;
}

const platformSchema = z.enum(PROFILE_PLATFORMS);

/**
 * Elige con qué cuenta (PSN o Steam) se muestra el perfil: nombre y foto.
 * Sólo tiene sentido con las dos conectadas; con una sola, `public_profiles`
 * usa esa sin importar la preferencia. Doble capa: el valor se valida acá y en
 * el `check` de `users.profile_platform`; la RLS exige que la fila sea propia.
 */
export async function saveProfilePlatform(
  _prevState: ProfilePlatformActionState,
  formData: FormData,
): Promise<ProfilePlatformActionState> {
  const parsed = platformSchema.safeParse(formData.get("platform"));
  if (!parsed.success) return { error: "Plataforma inválida.", success: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Volvé a iniciar sesión.", success: null };

  const { error } = await supabase
    .from("users")
    .update({ profile_platform: parsed.data })
    .eq("id", user.id);
  if (error) return { error: "No se pudo guardar. Probá de nuevo.", success: null };

  revalidatePath("/perfil", "layout");
  revalidatePath("/configuracion/perfil");
  return { error: null, success: "Listo: tu perfil se muestra con esa cuenta." };
}

export type PlatinumPrefsResult = { error: string | null };

const platinumPrefsSchema = z.object({ sound: z.boolean(), effects: z.boolean() });

/**
 * Preferencias del platino: sonido y efectos visuales (lluvia, reflejos,
 * celebración animada), independientes entre sí. En la base y no en el
 * navegador para que valgan en todos los dispositivos; la RLS
 * `users_update_own` exige que la fila sea propia.
 */
export async function savePlatinumPrefs(input: {
  sound: boolean;
  effects: boolean;
}): Promise<PlatinumPrefsResult> {
  const parsed = platinumPrefsSchema.safeParse(input);
  if (!parsed.success) return { error: "Preferencia inválida." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Volvé a iniciar sesión." };

  const { error } = await supabase
    .from("users")
    .update({
      platinum_sound_enabled: parsed.data.sound,
      platinum_effects_enabled: parsed.data.effects,
    })
    .eq("id", user.id);
  if (error) return { error: "No se pudo guardar. Probá de nuevo." };
  return { error: null };
}
