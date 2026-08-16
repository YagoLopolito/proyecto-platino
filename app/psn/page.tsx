import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConnectPsnForm } from "./ConnectPsnForm";
import { SyncButton } from "./SyncButton";

export default async function PsnPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: psnAccount } = await supabase
    .from("psn_accounts")
    .select("online_id, token_status, last_synced_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <Link href="/perfil" className="text-sm text-zinc-400 hover:underline">
            ← Volver al perfil
          </Link>
          <h1 className="text-xl font-semibold">Cuenta PSN</h1>
          <p className="text-sm text-zinc-400">
            Vinculá tu cuenta de PlayStation Network para sincronizar tus trofeos.
          </p>
        </div>

        {psnAccount ? (
          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm">
              Conectada como <span className="font-medium">{psnAccount.online_id}</span>
            </p>
            <p className="text-xs text-zinc-500">
              Estado del token: {psnAccount.token_status} · Última sync:{" "}
              {psnAccount.last_synced_at
                ? new Date(psnAccount.last_synced_at).toLocaleString("es-AR")
                : "nunca"}
            </p>
            {psnAccount.token_status === "invalid" && (
              <p className="text-sm text-amber-400">
                El NPSSO expiró. Pegá uno nuevo abajo para reconectar.
              </p>
            )}
            <SyncButton />
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Todavía no vinculaste ninguna cuenta PSN.</p>
        )}

        <NpssoInstructions />
        <ConnectPsnForm />
      </div>
    </div>
  );
}

function NpssoInstructions() {
  return (
    <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
      <h2 className="font-medium text-zinc-50">¿Cómo obtengo mi NPSSO?</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Iniciá sesión en{" "}
          <a
            href="https://www.playstation.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            playstation.com
          </a>{" "}
          con tu cuenta PSN, en este mismo navegador.
        </li>
        <li>
          Sin cerrar sesión, abrí en una pestaña nueva{" "}
          <a
            href="https://ca.account.sony.com/api/v1/ssocookie"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            ca.account.sony.com/api/v1/ssocookie
          </a>
          .
        </li>
        <li>
          Vas a ver un JSON como{" "}
          <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-xs">
            {"{"}&quot;npsso&quot;:&quot;...&quot;{"}"}
          </code>
          . Copiá solo el valor de <code>npsso</code> (sin comillas).
        </li>
        <li>Pegalo en el campo de abajo.</li>
      </ol>
      <p className="text-xs text-zinc-500">
        Tu NPSSO se guarda cifrado y solo se usa desde el servidor para sincronizar tus trofeos.
        Nunca lo compartas: es equivalente a una contraseña de sesión.
      </p>
    </div>
  );
}
