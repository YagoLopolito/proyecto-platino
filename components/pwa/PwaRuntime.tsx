"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonClassName } from "@/components/Button";

/** Cada cuánto se le pregunta al server si hubo un deploy nuevo. */
const VERSION_POLL_MS = 5 * 60 * 1000;

/**
 * El build id que traía el bundle que está corriendo en este momento. Lo
 * inyecta `next.config.ts` desde el SHA del commit deployado.
 */
const CURRENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/**
 * Runtime de la PWA: registra el service worker y avisa cuando hay una versión
 * nueva de la app.
 *
 * El problema que resuelve: una app instalada en el celular no se "actualiza"
 * sola como una pestaña del navegador. Cuando mergeamos un PR y Vercel
 * deploya, el usuario puede quedarse con el bundle viejo abierto por días.
 * Acá se compara el build id horneado en este bundle contra el que devuelve
 * `/api/version` (siempre el del deploy vivo); si difieren, aparece el cartel
 * de actualizar, que vacía las cachés del SW y recarga.
 *
 * Se chequea al montar, cada vez que la app vuelve a primer plano (el caso
 * típico: el usuario la reabre desde el ícono del home screen) y cada 5
 * minutos si queda abierta.
 */
export function PwaRuntime() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // `updateViaCache: "none"` para que el browser revalide /sw.js contra el
    // server en vez de servir el que tenga en su caché HTTP.
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Un SW que no registra (modo incógnito, browser viejo, sin HTTPS) no
      // rompe nada: la app funciona igual, sólo sin offline ni instalación.
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkVersion() {
      // En dev el build id es "dev" siempre: el cartel sería ruido permanente.
      if (CURRENT_BUILD_ID === "dev" || document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const { buildId } = (await response.json()) as { buildId?: string };
        if (!cancelled && buildId && buildId !== CURRENT_BUILD_ID) {
          setUpdateAvailable(true);
        }
      } catch {
        // Sin conexión o server caído: se reintenta en el próximo ciclo.
      }
    }

    void checkVersion();
    const interval = setInterval(() => void checkVersion(), VERSION_POLL_MS);
    document.addEventListener("visibilitychange", checkVersion);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkVersion);
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    setReloading(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      // Vaciar las cachés del SW antes de recargar: si no, los assets viejos
      // con hash siguen ahí y la recarga podría traer una mezcla de versiones.
      registration?.active?.postMessage("platinoob:clear-caches");
      await registration?.update();
    } catch {
      // Da igual por qué falle: la recarga de abajo es lo que importa.
    }
    window.location.reload();
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      data-testid="update-banner"
      // `pb-safe` para no quedar debajo de la barra de gestos del iPhone, y
      // `bottom-16` en mobile para no taparse con la barra de navegación.
      className="fixed inset-x-3 bottom-20 z-50 flex items-center gap-3 rounded-card border border-accent-ink/60 bg-surface-raised p-3 shadow-lg pb-safe sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
    >
      <p className="flex-1 type-meta text-ink">Hay una versión nueva de Platinoob.</p>
      <button
        type="button"
        onClick={() => void applyUpdate()}
        disabled={reloading}
        className={buttonClassName("primary", "shrink-0")}
      >
        {reloading ? "Actualizando…" : "Actualizar"}
      </button>
    </div>
  );
}
