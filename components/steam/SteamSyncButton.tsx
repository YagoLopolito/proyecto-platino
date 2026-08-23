"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";

type SyncMessage =
  | { kind: "success"; text: string }
  | { kind: "private"; text: string }
  | { kind: "error"; text: string };

/**
 * Espejo de components/psn/SyncButton para /api/steam/sync.
 *
 * El estado que importa distinguir acá no es "token vencido" (Steam no tiene
 * token de usuario) sino **perfil en privado**: no se arregla reintentando ni
 * reconectando, solo cambiando la privacidad en Steam, así que tiene su propio
 * mensaje con el camino exacto.
 */
export default function SteamSyncButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<SyncMessage | null>(null);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/steam/sync", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 409) {
          setMessage({
            kind: "private",
            text:
              body?.error ??
              "El perfil de Steam está en privado y no se pueden leer tus juegos.",
          });
        } else {
          setMessage({
            kind: "error",
            text:
              body?.error ??
              "No se pudo sincronizar con Steam. Probá de nuevo en unos minutos.",
          });
        }
        return;
      }
      const body = await response.json();
      setMessage({
        kind: "success",
        text: `Sincronizado: ${body.titlesSynced} juegos, ${body.achievementsSynced} logros (${body.titlesWithoutAchievements} juegos sin logros).`,
      });
      router.refresh();
    } catch {
      setMessage({
        kind: "error",
        text: "No se pudo conectar con el servidor. Revisá tu conexión y probá de nuevo.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleClick} disabled={pending} className={className}>
        {pending ? "Sincronizando..." : "Sincronizar ahora"}
      </Button>

      {message?.kind === "success" && <FormSuccess>{message.text}</FormSuccess>}

      {message?.kind === "private" && (
        <div className="space-y-1">
          <FormError>{message.text}</FormError>
          <p className="text-sm text-zinc-400">
            En Steam: Perfil → Editar perfil → Configuración de privacidad → &quot;Detalles del
            juego&quot;: Público.
          </p>
        </div>
      )}

      {message?.kind === "error" && <FormError>{message.text}</FormError>}
    </div>
  );
}
