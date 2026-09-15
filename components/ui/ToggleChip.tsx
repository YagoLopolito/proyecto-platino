"use client";

import type { ReactNode } from "react";

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
      className={`flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:min-h-9 ${
        checked
          ? "border-accent bg-accent/15 text-accent"
          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3 w-3 transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      >
        <path d="m5 13 4 4L19 7" />
      </svg>
      {children}
    </button>
  );
}
