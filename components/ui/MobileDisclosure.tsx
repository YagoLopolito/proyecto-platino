import type { ReactNode } from "react";

/**
 * Controles que en mobile viven plegados detrás de un botón y en escritorio se
 * muestran siempre.
 *
 * El problema que resuelve: en la biblioteca, las chips de orden + las de
 * filtro + los dos checkboxes ocupaban media pantalla de 375px *antes* de la
 * primera carátula. En una app de navegar (la referencia es Letterboxd) lo
 * primero que se ve tiene que ser el contenido, no sus filtros.
 *
 * Es `<details>` y no estado de React a propósito: no necesita JS, sobrevive
 * al render del servidor y el plegado sigue siendo accesible (el `summary` es
 * un botón nativo con su `aria-expanded`). Que en `sm` se vea siempre se
 * resuelve por CSS -- el `summary` se esconde y el cuerpo se fuerza visible --
 * y no cambiando el atributo `open`, que no tiene variante responsive.
 */
export function MobileDisclosure({
  label,
  children,
  summaryHint,
}: {
  /** Texto del botón que despliega ("Ordenar y filtrar"). */
  label: string;
  /** Resumen corto del estado actual, a la derecha del label. */
  summaryHint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group sm:contents">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-xs text-zinc-300 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:hidden">
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M3 5h18v2l-7 7v5l-4 2v-7L3 7V5Z" />
          </svg>
          {label}
        </span>
        {summaryHint && <span className="truncate text-zinc-500">{summaryHint}</span>}
        <span
          className="text-zinc-500 transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>
      <div className="hidden pt-3 group-open:block sm:block sm:pt-0">{children}</div>
    </details>
  );
}
