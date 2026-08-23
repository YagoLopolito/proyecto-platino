import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Configuración es la casa de todo lo que no es contenido: por ahora solo
 * Conexiones, pero la estructura de tabs ya está lista para el nombre de
 * usuario, las preferencias del diario y el borrado de cuenta.
 */
const TABS = [{ href: "/configuracion/conexiones", label: "Conexiones" }];

export default function ConfiguracionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-8 sm:py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Configuración</h1>

        <nav aria-label="Configuración" className="flex gap-1 border-b border-zinc-800 text-sm">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-t px-3 py-2 text-zinc-300 hover:text-zinc-50"
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  );
}
