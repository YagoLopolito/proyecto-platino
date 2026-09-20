"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

/**
 * Chip de activar/desactivar (lo que antes era un `<input type="checkbox">`
 * suelto con su texto al lado).
 *
 * Sigue siendo un checkbox de verdad para la accesibilidad -- `role="switch"`
 * sobre un `<button>` con `aria-checked` -- pero se ve y se toca como el resto
 * de los controles de la barra, con 44px de alto en vez de una casilla de 16px
 * que en un celular se falla la mitad de las veces.
 */
export function ToggleChip({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-card border px-3 type-caption font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 sm:min-h-9 ${
        checked
          ? // `accent-ink` y no `accent` para el TEXTO: el acento de relleno
            // sólo llega a 3.06:1 sobre superficie oscura y acá es tinta.
            "border-accent-ink bg-accent/15 text-accent-ink"
          : "border-border-strong bg-surface text-ink-muted hover:border-ink-faint hover:text-ink"
      }`}
    >
      <Icon
        name="check"
        className={`h-3 w-3 transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
      />
      {children}
    </button>
  );
}
