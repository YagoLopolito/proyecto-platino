"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * Evento no estándar de Chromium: lo dispara el browser cuando la app cumple
 * los requisitos de instalación (manifest válido + service worker + HTTPS).
 * No está en la lib de TS, por eso el tipo va a mano.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Tarjeta para instalar Platinoob en el celular. Vive en
 * Configuración › Conexiones.
 *
 * Tres estados posibles, porque cada plataforma hace esto distinto:
 * - Ya instalada (`display-mode: standalone`): no se muestra nada.
 * - Chromium (Android, escritorio): se captura `beforeinstallprompt` y se
 *   ofrece el botón que abre el diálogo nativo.
 * - iOS: Safari no tiene ese evento ni API de instalación; lo único posible es
 *   explicarle al usuario dónde está "Añadir a pantalla de inicio".
 */
/** El `subscribe` de una fuente que nunca cambia durante la vida de la página. */
function subscribeNever() {
  return () => {};
}

function getIsIOSSnapshot() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function subscribeDisplayMode(onChange: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getIsStandaloneSnapshot() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS no soporta `display-mode: standalone` en matchMedia; usa esto.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallAppCard() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  /*
   * `useSyncExternalStore` y no `useState` + `useEffect`: estos dos valores
   * salen de APIs del browser que no existen en el server, y sincronizarlos
   * con un setter dentro de un effect es justo lo que prohíbe
   * `react-hooks/set-state-in-effect` (ver Convenciones de código en
   * CLAUDE.md). El snapshot del server es "ya instalada" para que la tarjeta
   * no aparezca y desaparezca durante la hidratación.
   */
  const isStandalone = useSyncExternalStore(
    subscribeDisplayMode,
    getIsStandaloneSnapshot,
    () => true,
  );
  const isIOS = useSyncExternalStore(subscribeNever, getIsIOSSnapshot, () => false);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      // Sin esto Chrome muestra su propio mini-infobar y el evento se pierde.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // El evento se consume: si lo rechazó, hay que esperar a que el browser lo
    // vuelva a disparar, no se puede reutilizar este.
    setPromptEvent(null);
    if (outcome === "accepted") setInstalled(true);
  }, [promptEvent]);

  if (isStandalone) return null;

  return (
    <section
      data-testid="install-app-card"
      className="space-y-4 rounded-card border border-border bg-surface p-4 sm:p-6"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-chip bg-surface-raised text-ink-muted">
            <Icon name="download" className="h-4 w-4" />
          </span>
          <h2 className="type-subtitle text-ink">Instalar Platinoob en el celular</h2>
        </div>
        <p className="type-meta text-ink-muted">
          Se agrega a la pantalla de inicio y se abre a pantalla completa, como una app. No pasa por
          ninguna tienda y se actualiza sola cuando publicamos cambios.
        </p>
      </div>

      {installed ? (
        <p className="flex items-center gap-1.5 type-meta text-success">
          <Icon name="check" className="h-4 w-4" />
          Listo, ya está instalada. Buscala en tu pantalla de inicio.
        </p>
      ) : promptEvent ? (
        <Button
          type="button"
          data-testid="install-app-button"
          onClick={() => void install()}
          className="w-full sm:w-auto"
        >
          Instalar app
        </Button>
      ) : isIOS ? (
        <ol className="list-decimal space-y-1 pl-5 type-meta text-ink-muted">
          <li>Abrí esta página en Safari (no funciona desde Chrome en iPhone).</li>
          <li>
            Tocá el botón <strong className="text-ink">Compartir</strong> de abajo.
          </li>
          <li>
            Elegí <strong className="text-ink">Añadir a pantalla de inicio</strong>.
          </li>
        </ol>
      ) : (
        <p className="type-meta text-ink-muted">
          Buscá la opción <strong className="text-ink">Instalar aplicación</strong> en el menú
          de tu navegador. Si no aparece, es que este navegador no soporta instalar apps web.
        </p>
      )}
    </section>
  );
}
