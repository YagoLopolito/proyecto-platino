import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConnectPsnForm from "./ConnectPsnForm";
import SyncButton from "./SyncButton";
import { SyncStatusBadge, type SyncTokenStatus } from "@/components/SyncStatusBadge";
import { ErrorState } from "@/components/ErrorState";

export default async function PsnPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: account } = await supabase
    .from("psn_accounts")
    .select("online_id, token_status, last_synced_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold">Cuenta PSN</h1>

        {account ? (
          <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <p className="text-zinc-400">
                  Conectado como <span className="font-mono text-zinc-50">{account.online_id}</span>
                </p>
                <SyncStatusBadge status={account.token_status as SyncTokenStatus} />
              </div>
              <p className="text-zinc-400">
                Última sincronización:{" "}
                {account.last_synced_at
                  ? new Date(account.last_synced_at).toLocaleString("es-AR")
                  : "todavía no se sincronizó"}
              </p>
            </div>

            {account.token_status !== "valid" && (
              <ErrorState
                message={
                  account.token_status === "expired"
                    ? "Tu NPSSO venció. Pegá uno nuevo abajo para volver a sincronizar."
                    : "La última conexión con PSN falló. Pegá un NPSSO nuevo abajo para reconectar."
                }
              />
            )}

            <SyncButton />
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            Conectá tu cuenta de PlayStation Network para traer automáticamente tus juegos y
            trofeos.
          </p>
        )}

        <ConnectPsnForm />
      </div>
    </div>
  );
}
