import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildSteamLoginUrl,
  getPlayerSummary,
  verifySteamOpenIdResponse,
  SteamApiKeyMissingError,
} from "@/lib/steam";

/**
 * Verificación de la cuenta de Steam con Steam OpenID.
 *
 * Va como route handler y no como Server Action porque el flujo es una
 * navegación completa: se redirige al usuario a Steam y Steam lo devuelve acá
 * con un GET. Una Server Action no puede recibir ese callback.
 *
 * Dos entradas, la misma ruta:
 * - sin `openid.mode`: arranca el flujo (redirect a Steam).
 * - con `openid.mode=id_res`: es Steam devolviendo al usuario.
 */
const CONNECTIONS_PATH = "/configuracion/conexiones";

function redirectToConnections(request: NextRequest, params: Record<string, string>) {
  const url = new URL(CONNECTIONS_PATH, request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  const params = request.nextUrl.searchParams;

  if (params.get("openid.mode") === null) {
    const returnTo = new URL("/api/steam/openid", request.nextUrl.origin).toString();
    return NextResponse.redirect(buildSteamLoginUrl(returnTo, `${request.nextUrl.origin}/`));
  }

  let verifiedSteamId: string | null;
  try {
    verifiedSteamId = await verifySteamOpenIdResponse(params);
  } catch {
    return redirectToConnections(request, { steam: "error" });
  }

  // Respuesta falsificada o cancelada por el usuario: no se toca la cuenta.
  if (!verifiedSteamId) {
    return redirectToConnections(request, { steam: "invalido" });
  }

  const { data: account } = await supabase
    .from("steam_accounts")
    .select("steam_id64")
    .eq("user_id", user.id)
    .maybeSingle();

  // Ya tenía conectada otra cuenta: se avisa en vez de pisarla en silencio.
  // El usuario decide si la reemplaza (ver ReplaceSteamAccountForm).
  if (account && account.steam_id64 !== verifiedSteamId) {
    return redirectToConnections(request, { steam: "distinta", verificada: verifiedSteamId });
  }

  // La cuenta ya conectada es la misma: solo se marca como verificada. Va como
  // UPDATE y no como upsert porque `persona_name` es NOT NULL: un upsert
  // parcial fallaría al armar la fila del INSERT antes de llegar al conflicto.
  if (account) {
    const { error } = await supabase
      .from("steam_accounts")
      .update({ verified: true })
      .eq("user_id", user.id);
    return redirectToConnections(request, { steam: error ? "error" : "verificada" });
  }

  // Sin cuenta previa, OpenID alcanza para conectarla de cero: el SteamID ya
  // viene verificado, así que no hace falta pasar por el input manual.
  let personaName = verifiedSteamId;
  let avatarUrl: string | null = null;
  let isPublic = true;
  try {
    const profile = await getPlayerSummary(verifiedSteamId);
    personaName = profile.personaName;
    avatarUrl = profile.avatarUrl;
    isPublic = profile.isProfilePublic;
  } catch (cause) {
    // Sin STEAM_API_KEY no se puede traer el nombre, pero la verificación en sí
    // ya es válida: se guarda igual con el SteamID como nombre visible.
    if (!(cause instanceof SteamApiKeyMissingError)) {
      return redirectToConnections(request, { steam: "error" });
    }
  }

  const { error } = await supabase.from("steam_accounts").insert({
    user_id: user.id,
    steam_id64: verifiedSteamId,
    persona_name: personaName,
    avatar_url: avatarUrl,
    profile_visibility: isPublic ? "public" : "private",
    verified: true,
  });

  return redirectToConnections(request, { steam: error ? "error" : "verificada" });
}
