import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sin conexión — Platinoob" };

/**
 * Fallback que sirve el service worker cuando una navegación falla por falta
 * de conexión. Tiene que ser estática y no depender de la sesión: se precachea
 * en el `install` del SW, antes de que haya usuario.
 */
export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">
        📡
      </p>
      <h1 className="text-2xl font-semibold text-zinc-50">Sin conexión</h1>
      <p className="max-w-sm text-sm text-zinc-400">
        Platinoob necesita internet para traer tus trofeos y tu diario. Volvé a intentar cuando
        recuperes la señal.
      </p>
    </main>
  );
}
