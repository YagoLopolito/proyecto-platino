"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";
import { PSN_SYNC_COOLDOWN_MS, formatCooldown } from "@/lib/sync/cooldown";
import { requestPlatinumCheck } from "@/components/platinum/PlatinumProvider";

type SyncMessage =
  | { kind: "success"; text: string }
  | { kind: "expired"; text: string }
  | { kind: "error"; text: string }
  | { kind: "cooldown"; text: string };

/**
 * Dispara /api/psn/sync desde donde se lo monte (la página de PSN y la
 * biblioteca) -- sincronizar no debería obligar a irse hasta /psn.
 *
 * `reconnectHref` cambia porque el form de reconexión vive en Configuración >
 * Conexiones: desde ahí alcanza el ancla local, desde otra página hay que navegar.
 *
 * `cooldownMs` es lo que falta del freno de frecuencia (#128), calculado en el
 * server con `cooldownRemainingMs`: mientras dure, el botón queda deshabilitado.
 */
export default function SyncButton({
  className = "",
  reconnectHref = "#reconectar-psn",
  variant = "secondary",
  cooldownMs = 0,
}: {
  className?: string;
  reconnectHref?: string;
  /** En Conexiones es la acción primaria de la tarjeta; en la biblioteca, una más de la barra. */
  variant?: "primary" | "secondary";
  cooldownMs?: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<SyncMessage | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(cooldownMs);

  // Cuenta regresiva de a un minuto: el texto sólo muestra minutos.
  const coolingDown = cooldownLeft > 0;
  useEffect(() => {
    if (!coolingDown) return;
    const id = setInterval(() => {
      setCooldownLeft((left) => Math.max(0, left - 60_000));
    }, 60_000);
    return () => clearInterval(id);
  }, [coolingDown]);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/psn/sync", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 429) {
          setCooldownLeft((body?.retryAfterSeconds ?? 60) * 1000);
          setMessage({
            kind: "cooldown",
            text: body?.error ?? "Ya sincronizaste hace poco. Probá de nuevo en unos minutos.",
          });
        } else if (response.status === 409) {
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
      setCooldownLeft(PSN_SYNC_COOLDOWN_MS);
      router.refresh();
      // Un platino nuevo se celebra ya, no en la próxima apertura de la app.
      requestPlatinumCheck();
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
      <Button
        type="button"
        variant={variant}
        onClick={handleClick}
        disabled={pending || coolingDown}
        className={className}
      >
        {pending ? "Sincronizando..." : "Sincronizar ahora"}
      </Button>

      {message?.kind === "success" && <FormSuccess>{message.text}</FormSuccess>}

      {message?.kind === "expired" && (
        <div className="space-y-1">
          <FormError>{message.text}</FormError>
          <a
            href={reconnectHref}
            className="rounded-chip type-meta text-accent-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {reconnectHref.startsWith("#") ? "Reconectar cuenta PSN ↓" : "Reconectar cuenta PSN"}
          </a>
        </div>
      )}

      {message?.kind === "error" && <FormError>{message.text}</FormError>}

      {message?.kind === "cooldown" && <FormError>{message.text}</FormError>}

      {coolingDown && message?.kind !== "cooldown" && (
        <p className="type-caption text-ink-muted">
          Podés volver a sincronizar en {formatCooldown(cooldownLeft)}.
        </p>
      )}
    </div>
  );
}
