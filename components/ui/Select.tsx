import type { SelectHTMLAttributes } from "react";

/**
 * `<select>` nativo con la piel de la app: sin la flecha del sistema (que en
 * Android es gris sobre gris y en iOS no existe), con la nuestra dibujada al
 * lado.
 *
 * Nativo y no un dropdown propio a propósito: en un celular el selector del
 * sistema es una rueda a pantalla completa, con la que se elige entre cinco
 * opciones mucho más rápido que con una lista custom, y no hay que
 * reimplementar teclado ni foco.
 */
export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative ${className}`}>
      <select
        {...props}
        className="min-h-11 w-full appearance-none rounded-lg border border-zinc-800 bg-zinc-950 pl-3 pr-8 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-700 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:min-h-9"
      >
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
