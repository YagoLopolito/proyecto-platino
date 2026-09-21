import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Sin conexión — Platinoob" };

/**
 * Fallback que sirve el service worker cuando una navegación falla por falta
 * de conexión. Tiene que ser estática y no depender de la sesión: se precachea
 * en el `install` del SW, antes de que haya usuario.
 */
export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {/* Ícono del set y no el 📡: un emoji se dibuja distinto en cada sistema
          y no toma el color del tema (issue #176 §3.3). */}
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised text-ink-faint">
        <Icon name="offline" className="h-8 w-8" />
      </span>
      <h1 className="type-title text-ink">Sin conexión</h1>
      <p className="max-w-sm type-body text-ink-muted">
        Platinoob necesita internet para traer tus trofeos y tu diario. Volvé a intentar cuando
        recuperes la señal.
      </p>
    </main>
  );
}
