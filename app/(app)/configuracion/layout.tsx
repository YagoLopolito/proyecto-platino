import type { ReactNode } from "react";
import { ConfigTabs } from "./ConfigTabs";

/**
 * Configuración es la casa de todo lo que no es contenido: por ahora solo
 * Conexiones, pero la estructura de tabs ya está lista para el nombre de
 * usuario, las preferencias del diario y el borrado de cuenta.
 *
 * `max-w-2xl`: es el ancho de las pantallas de formulario (Configuración y
 * las de auth), contra el `max-w-5xl` de las de listado. Son los dos únicos
 * anchos de contenedor de la app.
 */
const TABS = [{ href: "/configuracion/conexiones", label: "Conexiones" }];

export default function ConfiguracionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="type-title">Configuración</h1>

        <ConfigTabs tabs={TABS} />

        {children}
      </div>
    </div>
  );
}
