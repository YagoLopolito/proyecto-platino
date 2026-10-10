"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logDbError } from "@/lib/errors";
import { encryptSecret, getPsnIdentityFromNpsso, NpssoExpiredError } from "@/lib/psn";
import {
  resolveSteamProfile,
  SteamApiKeyMissingError,
  SteamProfileNotFoundError,
} from "@/lib/steam";

export type ConnectionActionState = { error: string | null; success?: string | null };

/** Todas las tarjetas de Conexiones viven en esta ruta. */
const CONNECTIONS_PATH = "/configuracion/conexiones";

export async function connectPsnAccount(
  _prevState: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
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
    console.error("[conexiones] getPsnIdentityFromNpsso failed", cause);
    return { error: "No se pudo validar el NPSSO. Revisá que lo hayas copiado completo." };
  }

  // Con service role (issue #130): `npsso_encrypted` no es legible para
  // `authenticated`, y un upsert con ON CONFLICT DO UPDATE necesita leer la
  // fila existente. El `user_id` sale de la sesión validada arriba, nunca del
  // form, así que bypassear RLS acá no deja escribir la cuenta de otro.
  const { error } = await createServiceClient().from("psn_accounts").upsert(
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
    logDbError("conexiones.connectPsnAccount", error);
    return { error: "No se pudo guardar la conexión. Probá de nuevo en unos minutos." };
  }

  revalidatePath(CONNECTIONS_PATH);
  revalidatePath("/perfil");
  return { error: null, success: `Cuenta PSN conectada: ${identity.onlineId}` };
}

/**
 * Desconectar borra solo el vínculo con la plataforma. Los juegos y trofeos ya
 * sincronizados se quedan: son del usuario, y borrarlos silenciosamente al
 * desconectar sería destruir su historial (y el diario que cuelga de él).
 */
export async function disconnectPsnAccount(
  _prevState: ConnectionActionState,
): Promise<ConnectionActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const { error } = await supabase.from("psn_accounts").delete().eq("user_id", user.id);
  if (error) {
    logDbError("conexiones.disconnectPsnAccount", error);
    return { error: "No se pudo desconectar. Probá de nuevo en unos minutos." };
  }

  revalidatePath(CONNECTIONS_PATH);
  revalidatePath("/perfil");
  revalidatePath("/biblioteca");
  return { error: null, success: "Cuenta PSN desconectada." };
}

export async function connectSteamAccount(
  _prevState: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  const input = String(formData.get("steamId") ?? "").trim();
  if (!input) {
    return { error: "Pegá tu SteamID64 o la URL de tu perfil." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  let profile;
  try {
    profile = await resolveSteamProfile(input);
  } catch (cause) {
    if (cause instanceof SteamProfileNotFoundError) {
      return { error: cause.message };
    }
    if (cause instanceof SteamApiKeyMissingError) {
      return { error: cause.message };
    }
    console.error("[conexiones] resolveSteamProfile failed", cause);
    return { error: "No se pudo consultar Steam. Probá de nuevo en unos minutos." };
  }

  // El perfil se guarda igual aunque esté en privado: la cuenta queda
  // conectada y la tarjeta explica qué cambiar para que el sync traiga algo.
  // Sin esto, el usuario no tendría dónde ver el problema.
  const { error } = await supabase.from("steam_accounts").upsert(
    {
      user_id: user.id,
      steam_id64: profile.steamId64,
      persona_name: profile.personaName,
      avatar_url: profile.avatarUrl,
      profile_visibility: profile.isProfilePublic ? "public" : "private",
      // Tipear un SteamID no prueba que la cuenta sea tuya. Queda en false
      // hasta que exista el login por Steam OpenID.
      verified: false,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    logDbError("conexiones.connectSteamAccount", error);
    return { error: "No se pudo guardar la conexión. Probá de nuevo en unos minutos." };
  }

  revalidatePath(CONNECTIONS_PATH);
  revalidatePath("/perfil");
  return { error: null, success: `Cuenta de Steam conectada: ${profile.personaName}` };
}

export async function disconnectSteamAccount(
  _prevState: ConnectionActionState,
): Promise<ConnectionActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const { error } = await supabase.from("steam_accounts").delete().eq("user_id", user.id);
  if (error) {
    logDbError("conexiones.disconnectSteamAccount", error);
    return { error: "No se pudo desconectar. Probá de nuevo en unos minutos." };
  }

  revalidatePath(CONNECTIONS_PATH);
  revalidatePath("/perfil");
  revalidatePath("/biblioteca");
  return { error: null, success: "Cuenta de Steam desconectada." };
}

/**
 * Reemplaza la cuenta de Steam conectada por la que el usuario acaba de
 * verificar con OpenID.
 *
 * El SteamID llega del form, así que **no se confía en él**: se acepta sólo si
 * coincide con el que la propia app dejó en la URL tras validar contra Steam...
 * y como eso tampoco es una garantía del lado del servidor, la fila queda con
 * `verified = false` salvo que se rehaga el flujo de OpenID. Reemplazar acá es
 * la parte de "cambiar de cuenta"; verificarla es el flujo de /api/steam/openid.
 */
export async function replaceSteamAccount(
  _prevState: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  const steamId = String(formData.get("steamId") ?? "").trim();
  if (!/^\d{17}$/.test(steamId)) {
    return { error: "SteamID inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  let profile;
  try {
    profile = await resolveSteamProfile(steamId);
  } catch (cause) {
    if (cause instanceof SteamProfileNotFoundError || cause instanceof SteamApiKeyMissingError) {
      return { error: cause.message };
    }
    console.error("[conexiones] resolveSteamProfile failed", cause);
    return { error: "No se pudo consultar Steam. Probá de nuevo en unos minutos." };
  }

  const { error } = await supabase.from("steam_accounts").upsert(
    {
      user_id: user.id,
      steam_id64: profile.steamId64,
      persona_name: profile.personaName,
      avatar_url: profile.avatarUrl,
      profile_visibility: profile.isProfilePublic ? "public" : "private",
      verified: false,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    logDbError("conexiones.replaceSteamAccount", error);
    return { error: "No se pudo reemplazar la cuenta. Probá de nuevo en unos minutos." };
  }

  revalidatePath(CONNECTIONS_PATH);
  revalidatePath("/perfil");
  return {
    error: null,
    success: `Cuenta reemplazada por ${profile.personaName}. Verificala con Steam para confirmarla.`,
  };
}
