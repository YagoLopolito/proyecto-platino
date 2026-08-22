"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret, getPsnIdentityFromNpsso, NpssoExpiredError } from "@/lib/psn";

export type PsnActionState = { error: string | null; success?: string | null };

export async function connectPsnAccount(
  _prevState: PsnActionState,
  formData: FormData,
): Promise<PsnActionState> {
  const npsso = String(formData.get("npsso") ?? "").trim();
  if (!npsso) {
    return { error: "Pegá tu NPSSO." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  let identity;
  try {
    identity = await getPsnIdentityFromNpsso(npsso);
  } catch (cause) {
    if (cause instanceof NpssoExpiredError) {
      return { error: cause.message };
    }
    return { error: "No se pudo validar el NPSSO. Revisá que lo hayas copiado completo." };
  }

  const { error } = await supabase.from("psn_accounts").upsert(
    {
      user_id: user.id,
      online_id: identity.onlineId,
      account_id: identity.accountId,
      avatar_url: identity.avatarUrl,
      npsso_encrypted: encryptSecret(npsso),
      token_status: "valid",
      // Nivel/totales reales de PSN desde la conexión, así el perfil ya los
      // muestra sin esperar al primer sync.
      trophy_level: identity.trophySummary.level,
      trophy_progress: identity.trophySummary.progressPercent,
      trophy_tier: identity.trophySummary.tier,
      earned_platinum: identity.trophySummary.earned.platinum,
      earned_gold: identity.trophySummary.earned.gold,
      earned_silver: identity.trophySummary.earned.silver,
      earned_bronze: identity.trophySummary.earned.bronze,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: `No se pudo guardar la conexión: ${error.message}` };
  }

  revalidatePath("/psn");
  revalidatePath("/perfil");
  return { error: null, success: `Cuenta PSN conectada: ${identity.onlineId}` };
}
