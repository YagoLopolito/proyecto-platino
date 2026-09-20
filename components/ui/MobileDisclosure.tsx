"use client";

import { useId, useState, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

/**
 * Controles que en mobile viven plegados detrás de un botón y en escritorio se
 * muestran siempre.
 *
 * El problema que resuelve: en la biblioteca, el orden + los filtros + los dos
 * interruptores ocupaban media pantalla de 375px *antes* de la primera
 * carátula. En una app de navegar (la referencia es Letterboxd) lo primero que
 * se ve tiene que ser el contenido, no sus filtros.
 *
 * **Por qué no es un `<details>`**, que sería lo obvio y no necesitaría JS: el
 * contenido de un `<details>` cerrado hoy se esconde vía `::details-content`,
 * que Chrome renderiza con `content-visibility: hidden`; una regla del autor
 * (`sm:block`) ya no alcanza para mostrarlo, así que en escritorio los
 * controles desaparecían por completo -- se vio recién al renderizar la
 * pantalla, no en el type-check ni en el build. Con estado propio, el
 * `sm:block` del cuerpo gana siempre y el plegado es sólo cosa de mobile.
 */
export function MobileDisclosure({
  label,
  children,
  activeCount = 0,
}: {
  /** Texto del botón que despliega ("Filtros"). */
  label: string;
  /** Cuántos filtros hay aplicados: se muestra como globito sobre el botón. */
  activeCount?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    // Cerrado es una píldora al lado del buscador; abierto ocupa la fila entera
    // (el `flex-wrap` del padre lo baja a la línea de abajo) para que los
    // controles no queden espichados en media columna. En `sm` el wrapper es
    // `display: contents`: sus hijos se acomodan en la fila del padre, como si
    // este componente no existiera.
    <div className={`${open ? "w-full" : "shrink-0"} sm:contents`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={`flex min-h-11 items-center gap-2 rounded-card border bg-surface px-3 type-caption font-medium text-ink transition-colors hover:border-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 sm:hidden ${
          open ? "w-full border-ink-faint" : "border-border-strong"
        }`}
      >
        <Icon name="filters" className="h-4 w-4 text-ink-muted" />
        {label}
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        )}
        <Icon
          name="chevron-down"
          className={`ml-auto h-3.5 w-3.5 text-ink-faint transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        id={bodyId}
        className={`w-full pt-3 sm:block sm:w-auto sm:pt-0 ${open ? "block" : "hidden"}`}
      >
        {children}
      </div>
    </div>
  );
}
