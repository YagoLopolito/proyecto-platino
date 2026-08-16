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
  } catch (error) {
    if (error instanceof NpssoExpiredError) {
      return { error: "Ese NPSSO no es válido o ya expiró. Volvé a generarlo y pegalo de nuevo." };
    }
    return { error: "No se pudo validar el NPSSO. Intentá de nuevo." };
  }

  const { error: dbError } = await supabase.from("psn_accounts").upsert(
    {
      user_id: user.id,
      online_id: identity.onlineId,
      account_id: identity.accountId,
      npsso_encrypted: encryptSecret(npsso),
      token_status: "valid",
    },
    { onConflict: "user_id" },
  );

  if (dbError) {
    return { error: `No se pudo guardar la cuenta PSN: ${dbError.message}` };
  }

  revalidatePath("/psn");
  return { error: null, success: `Cuenta PSN conectada: ${identity.onlineId}` };
}
