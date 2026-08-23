import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SyncButton from "@/components/psn/SyncButton";
import SteamSyncButton from "@/components/steam/SteamSyncButton";
import ConnectPsnForm from "@/components/connections/ConnectPsnForm";
import ConnectSteamForm from "@/components/connections/ConnectSteamForm";
import DisconnectButton from "@/components/connections/DisconnectButton";
import { ConnectionCard, type ConnectionStatus } from "@/components/connections/ConnectionCard";
import VerifySteamButton from "@/components/connections/VerifySteamButton";
import ReplaceSteamAccountForm from "@/components/connections/ReplaceSteamAccountForm";
import { ErrorState } from "@/components/ErrorState";
import { disconnectPsnAccount, disconnectSteamAccount } from "./actions";

/** Resultados del callback de Steam OpenID (ver /api/steam/openid). */
const OPENID_MESSAGE: Record<string, string> = {
  verificada: "Cuenta de Steam verificada.",
  invalido:
    "Steam no confirmó la sesión. Si cancelaste el login es esperable; si no, volvé a intentar.",
  error: "No se pudo completar la verificación con Steam. Probá de nuevo en unos minutos.",
};

export default async function ConexionesPage({
  searchParams,
}: {
  searchParams: Promise<{ steam?: string; verificada?: string }>;
}) {
  const { steam: openIdResult, verificada: verifiedSteamId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: psnAccount }, { data: steamAccount }] = await Promise.all([
    supabase
      .from("psn_accounts")
      .select("online_id, token_status, last_synced_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("steam_accounts")
      .select("persona_name, steam_id64, profile_visibility, verified, last_synced_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const psnStatus: ConnectionStatus = !psnAccount
    ? "disconnected"
    : psnAccount.token_status === "valid"
      ? "connected"
      : "attention";

  const steamStatus: ConnectionStatus = !steamAccount
    ? "disconnected"
    : steamAccount.profile_visibility === "public"
      ? "connected"
      : "attention";

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        Conectá las plataformas de las que querés traer tus juegos y trofeos. Podés tener una,
        las dos, o ninguna.
      </p>

      {openIdResult && OPENID_MESSAGE[openIdResult] && (
        <p
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            openIdResult === "verificada"
              ? "border-green-700 bg-green-950/30 text-green-400"
              : "border-amber-700 bg-amber-950/30 text-amber-300"
          }`}
        >
          {OPENID_MESSAGE[openIdResult]}
        </p>
      )}

      <ConnectionCard
        title="PlayStation Network"
        status={psnStatus}
        lastSyncedAt={psnAccount?.last_synced_at ?? null}
        subtitle={
          psnAccount ? (
            <>
              Conectado como <span className="font-mono text-zinc-50">{psnAccount.online_id}</span>
            </>
          ) : (
            "Tus juegos y trofeos se traen automáticamente desde tu cuenta PSN."
          )
        }
      >
        {psnAccount ? (
          <div className="space-y-4">
            {psnStatus === "attention" && (
              <ErrorState
                message={
                  psnAccount.token_status === "expired"
                    ? "Tu NPSSO venció. Pegá uno nuevo abajo para volver a sincronizar."
                    : "La última conexión con PSN falló. Pegá un NPSSO nuevo abajo para reconectar."
                }
              />
            )}

            {/* Con el token vencido el form va desplegado: es la única acción
                que destraba el flujo, esconderla detrás de un <details> obliga
                a un click de más justo cuando la app ya sabe que hace falta. */}
            {psnStatus === "connected" ? (
              <>
                <SyncButton />
                <details className="rounded border border-zinc-800 p-3">
                  <summary className="cursor-pointer text-sm text-zinc-300">
                    Reconectar con un NPSSO nuevo
                  </summary>
                  <div className="pt-4">
                    <ConnectPsnForm isReconnect />
                  </div>
                </details>
              </>
            ) : (
              <ConnectPsnForm isReconnect />
            )}

            <DisconnectButton
              action={disconnectPsnAccount}
              label="Desconectar cuenta PSN"
              confirmMessage="Se va a borrar el vínculo con tu cuenta PSN. Tus juegos, trofeos y diario ya sincronizados se mantienen. ¿Continuar?"
            />
          </div>
        ) : (
          <ConnectPsnForm />
        )}
      </ConnectionCard>

      <ConnectionCard
        title="Steam"
        status={steamStatus}
        lastSyncedAt={steamAccount?.last_synced_at ?? null}
        subtitle={
          steamAccount ? (
            <>
              Conectado como{" "}
              <span className="font-mono text-zinc-50">{steamAccount.persona_name}</span>
            </>
          ) : (
            "Tus juegos y logros de Steam, con el mismo seguimiento que los trofeos de PSN."
          )
        }
      >
        {steamAccount ? (
          <div className="space-y-4">
            {steamStatus === "attention" && (
              <div className="space-y-2">
                <ErrorState message="El perfil de Steam está en privado: la API devuelve cero juegos aunque todo lo demás esté bien." />
                <p className="text-sm text-zinc-400">
                  En Steam: Perfil → Editar perfil → Configuración de privacidad → &quot;Detalles
                  del juego&quot;: <span className="text-zinc-200">Público</span>. Después
                  sincronizá de nuevo.
                </p>
              </div>
            )}

            {steamAccount.verified ? (
              <p className="text-sm text-emerald-400">✓ Cuenta verificada con Steam.</p>
            ) : (
              <div className="space-y-2 rounded border border-zinc-700 bg-zinc-800/50 p-3">
                <p className="text-sm text-zinc-400">
                  <span className="text-zinc-200">Cuenta no verificada.</span> Escribiste el
                  SteamID a mano, así que no podemos comprobar que el perfil sea tuyo: solo
                  leemos datos públicos. Verificala iniciando sesión en Steam.
                </p>
                <VerifySteamButton label="Verificar con Steam" />
              </div>
            )}

            {openIdResult === "distinta" && verifiedSteamId && (
              <ReplaceSteamAccountForm verifiedSteamId={verifiedSteamId} />
            )}

            <SteamSyncButton />

            <details className="rounded border border-zinc-800 p-3">
              <summary className="cursor-pointer text-sm text-zinc-300">
                Conectar otro perfil de Steam
              </summary>
              <div className="pt-4">
                <ConnectSteamForm isReconnect />
              </div>
            </details>

            <DisconnectButton
              action={disconnectSteamAccount}
              label="Desconectar cuenta de Steam"
              confirmMessage="Se va a borrar el vínculo con tu cuenta de Steam. Tus juegos, logros y diario ya sincronizados se mantienen. ¿Continuar?"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <ConnectSteamForm />
            <div className="space-y-2 border-t border-zinc-800 pt-4">
              <p className="text-sm text-zinc-400">
                O conectala directamente iniciando sesión en Steam: así queda verificada de
                entrada y no hace falta escribir nada.
              </p>
              <VerifySteamButton label="Iniciar sesión con Steam" />
            </div>
          </div>
        )}
      </ConnectionCard>
    </div>
  );
}
