"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const RECEIVED_PATH = "/actividad/recibido";
/** Route handler y no Server Action: ver el comentario en el route. */
const ENDPOINT = "/api/actividad/no-leidas";

async function fetchUnread(markSeen: boolean): Promise<number> {
  const response = await fetch(ENDPOINT, { method: markSeen ? "POST" : "GET", cache: "no-store" });
  if (markSeen || !response.ok) return 0;
  const body: unknown = await response.json();
  return typeof body === "object" &&
    body !== null &&
    "count" in body &&
    typeof body.count === "number"
    ? body.count
    : 0;
}

const UnreadActivityContext = createContext(0);

/**
 * Contador de "no leídas" de Actividad › Recibido (me gusta, comentarios en tus
 * publicaciones, seguidores nuevos), compartido por el header y la barra
 * inferior para que sea una sola consulta.
 *
 * Sin Realtime ni polling: se recalcula al navegar y cuando la app vuelve a
 * primer plano (mismo criterio que el chequeo de versión de `PwaRuntime`).
 * Entrar a Recibido marca todo como leído.
 */
export function UnreadActivityProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  // Consultas al server (efecto externo): los setState pasan en el callback
  // async, no sincrónicamente dentro del effect.
  useEffect(() => {
    let cancelled = false;
    const onReceived = pathname === RECEIVED_PATH;
    const refresh = () => {
      void fetchUnread(onReceived)
        .then((value) => {
          if (!cancelled) setCount(value);
        })
        .catch(() => undefined);
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return <UnreadActivityContext.Provider value={count}>{children}</UnreadActivityContext.Provider>;
}

export function useUnreadActivity(): number {
  return useContext(UnreadActivityContext);
}

/** "3", "99+". */
export function formatUnread(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** El globito, sobre el ícono o al lado del texto de Actividad. */
export function UnreadDot({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="activity-unread"
      className={`flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-like px-1 type-caption font-semibold leading-none tabular-nums text-white ${className}`}
    >
      {formatUnread(count)}
    </span>
  );
}
