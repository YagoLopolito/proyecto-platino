import type { SelectHTMLAttributes } from "react";

import { Icon } from "@/components/ui/Icon";

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
        className="min-h-11 w-full appearance-none rounded-card border border-border-strong bg-surface pl-3 pr-8 type-caption font-medium text-ink transition-colors hover:border-ink-faint focus:border-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 sm:min-h-9"
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
      />
    </div>
  );
}
