import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SyncButton from "@/components/psn/SyncButton";
import { PSN_SYNC_COOLDOWN_MS, cooldownRemainingMs } from "@/lib/sync/cooldown";
import SteamSyncButton from "@/components/steam/SteamSyncButton";
import ConnectPsnForm from "@/components/connections/ConnectPsnForm";
import ConnectSteamForm from "@/components/connections/ConnectSteamForm";
import DisconnectButton from "@/components/connections/DisconnectButton";
import { ConnectionCard, type ConnectionStatus } from "@/components/connections/ConnectionCard";
import VerifySteamButton from "@/components/connections/VerifySteamButton";
import ReplaceSteamAccountForm from "@/components/connections/ReplaceSteamAccountForm";
import { ErrorState } from "@/components/ErrorState";
import { Disclosure } from "@/components/ui/Disclosure";
import { Icon } from "@/components/ui/Icon";
import { InstallAppCard } from "@/components/pwa/InstallAppCard";
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
      <p className="type-body text-ink-muted">
        Conectá las plataformas de las que querés traer tus juegos y trofeos. Podés tener una, las
        dos, o ninguna.
      </p>

      {openIdResult && OPENID_MESSAGE[openIdResult] && (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-card border p-3 type-meta ${
            openIdResult === "verificada"
              ? "border-success/40 bg-success/10 text-success"
              : "border-warning/40 bg-warning/10 text-warning"
          }`}
        >
          <Icon
            name={openIdResult === "verificada" ? "check" : "alert"}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>{OPENID_MESSAGE[openIdResult]}</span>
        </p>
      )}

      <ConnectionCard
        title="PlayStation Network"
        icon="gamepad"
        status={psnStatus}
        lastSyncedAt={psnAccount?.last_synced_at ?? null}
        subtitle={
          psnAccount ? (
            <>
              Conectado como <span className="font-mono text-ink">{psnAccount.online_id}</span>
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
                que destraba el flujo, esconderla detrás de un plegado obliga
                a un click de más justo cuando la app ya sabe que hace falta. */}
            {psnStatus === "connected" ? (
              <>
                <SyncButton
                  variant="primary"
                  cooldownMs={cooldownRemainingMs(psnAccount.last_synced_at, PSN_SYNC_COOLDOWN_MS)}
                />
                <Disclosure summary="Reconectar con un NPSSO nuevo">
                  <ConnectPsnForm isReconnect />
                </Disclosure>
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
        icon="monitor"
        status={steamStatus}
        lastSyncedAt={steamAccount?.last_synced_at ?? null}
        subtitle={
          steamAccount ? (
            <>
              Conectado como <span className="font-mono text-ink">{steamAccount.persona_name}</span>
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
                {/* Estas instrucciones NO van plegadas: son el arreglo de un
                    estado roto, y la app ya sabe que hacen falta. */}
                <p className="type-meta text-ink-muted">
                  En Steam: Perfil → Editar perfil → Configuración de privacidad → &quot;Detalles
                  del juego&quot;: <span className="text-ink">Público</span>. Después sincronizá
                  de nuevo.
                </p>
              </div>
            )}

            {steamAccount.verified ? (
              <p className="flex items-center gap-1.5 type-meta text-success">
                <Icon name="check" className="h-4 w-4" />
                Cuenta verificada con Steam.
              </p>
            ) : (
              <div className="space-y-2 rounded-card border border-border bg-surface-raised p-3">
                <p className="type-meta text-ink-muted">
                  <span className="text-ink">Cuenta no verificada.</span> Escribiste el SteamID a
                  mano, así que no podemos comprobar que el perfil sea tuyo: solo leemos datos
                  públicos. Verificala iniciando sesión en Steam.
                </p>
                <VerifySteamButton label="Verificar con Steam" />
              </div>
            )}

            {openIdResult === "distinta" && verifiedSteamId && (
              <ReplaceSteamAccountForm verifiedSteamId={verifiedSteamId} />
            )}

            <SteamSyncButton />

            <Disclosure summary="Conectar otro perfil de Steam">
              <ConnectSteamForm isReconnect />
            </Disclosure>

            <DisconnectButton
              action={disconnectSteamAccount}
              label="Desconectar cuenta de Steam"
              confirmMessage="Se va a borrar el vínculo con tu cuenta de Steam. Tus juegos, logros y diario ya sincronizados se mantienen. ¿Continuar?"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <ConnectSteamForm />
            <div className="space-y-2 border-t border-border pt-4">
              <p className="type-meta text-ink-muted">
                O conectala directamente iniciando sesión en Steam: así queda verificada de entrada
                y no hace falta escribir nada.
              </p>
              <VerifySteamButton label="Iniciar sesión con Steam" />
            </div>
          </div>
        )}
      </ConnectionCard>

      {/* Instalar la app en el celular. Va acá y no en una pantalla propia:
          es una conexión más entre el usuario y la app, y Configuración es
          donde ya viene a enchufar cosas. El componente se esconde solo si ya
          está instalada. */}
      <InstallAppCard />
    </div>
  );
}
