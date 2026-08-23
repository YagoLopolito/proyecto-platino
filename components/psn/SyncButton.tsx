"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";

type SyncMessage =
  | { kind: "success"; text: string }
  | { kind: "expired"; text: string }
  | { kind: "error"; text: string };

/**
 * Dispara /api/psn/sync desde donde se lo monte (la página de PSN y la
 * biblioteca) -- sincronizar no debería obligar a irse hasta /psn.
 *
 * `reconnectHref` cambia porque el form de reconexión vive en Configuración >
 * Conexiones: desde ahí alcanza el ancla local, desde otra página hay que navegar.
 */
export default function SyncButton({
  className = "",
  reconnectHref = "#reconectar-psn",
}: {
  className?: string;
  reconnectHref?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<SyncMessage | null>(null);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/psn/sync", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 409) {
          setMessage({
            kind: "expired",
            text: body?.error ?? "Tu NPSSO venció. Reconectá tu cuenta con uno nuevo.",
          });
        } else {
          setMessage({
            kind: "error",
            text:
              body?.error ??
              "No se pudo sincronizar. Puede ser un error transitorio de PSN, probá de nuevo en unos minutos.",
          });
        }
        return;
      }
      const body = await response.json();
      setMessage({
        kind: "success",
        text: `Sincronizado: ${body.titlesSynced} juegos, ${body.trophiesSynced} trofeos.`,
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

      {message?.kind === "expired" && (
        <div className="space-y-1">
          <FormError>{message.text}</FormError>
          <a
            href={reconnectHref}
            className="rounded text-sm text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
          >
            {reconnectHref.startsWith("#") ? "Reconectar cuenta PSN ↓" : "Reconectar cuenta PSN"}
          </a>
        </div>
      )}

      {message?.kind === "error" && <FormError>{message.text}</FormError>}
    </div>
  );
}
