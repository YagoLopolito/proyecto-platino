"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";
import { STEAM_SYNC_COOLDOWN_MS, formatCooldown } from "@/lib/sync/cooldown";

type SyncMessage =
  | { kind: "success"; text: string }
  | { kind: "private"; text: string }
  | { kind: "error"; text: string }
  | { kind: "cooldown"; text: string };

/**
 * Espejo de components/psn/SyncButton para /api/steam/sync.
 *
 * El estado que importa distinguir acá no es "token vencido" (Steam no tiene
 * token de usuario) sino **perfil en privado**: no se arregla reintentando ni
 * reconectando, solo cambiando la privacidad en Steam, así que tiene su propio
 * mensaje con el camino exacto.
 *
 * `cooldownMs` es lo que falta del freno de frecuencia (#159), calculado en el
 * server: mientras dure, el botón queda deshabilitado (igual que el de PSN).
 */
export default function SteamSyncButton({
  className = "",
  cooldownMs = 0,
}: {
  className?: string;
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
      const response = await fetch("/api/steam/sync", { method: "POST" });
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
            kind: "private",
            text:
              body?.error ?? "El perfil de Steam está en privado y no se pueden leer tus juegos.",
          });
        } else {
          setMessage({
            kind: "error",
            text:
              body?.error ?? "No se pudo sincronizar con Steam. Probá de nuevo en unos minutos.",
          });
        }
        return;
      }
      const body = await response.json();
      setMessage({
        kind: "success",
        text:
          `Sincronizado: ${body.titlesSynced} juegos, ${body.achievementsSynced} logros ` +
          `(${body.titlesWithoutAchievements} juegos sin logros).` +
          (body.playtimeHidden
            ? " Steam no reportó horas para ningún juego: en Steam › Editar perfil › Configuración" +
              ' de privacidad, desactivá "Mantener en privado el tiempo total de juego" si querés verlas acá.'
            : ""),
      });
      setCooldownLeft(STEAM_SYNC_COOLDOWN_MS);
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
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending || coolingDown}
        className={className}
      >
        {pending ? "Sincronizando..." : "Sincronizar ahora"}
      </Button>

      {message?.kind === "success" && <FormSuccess>{message.text}</FormSuccess>}

      {message?.kind === "private" && (
        <div className="space-y-1">
          <FormError>{message.text}</FormError>
          <p className="type-meta text-ink-muted">
            En Steam: Perfil → Editar perfil → Configuración de privacidad → &quot;Detalles del
            juego&quot;: Público.
          </p>
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
