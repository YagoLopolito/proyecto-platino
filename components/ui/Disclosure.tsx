import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * Bloque plegable, cerrado por defecto: las instrucciones de cada plataforma
 * en Conexiones, el form de reconexión, "conectar otro perfil".
 *
 * Es un `<details>` nativo, no estado de React: sin JS, accesible por
 * definición (el `summary` es un botón para el teclado y el lector de
 * pantalla) y sin flash en el primer render. A diferencia de
 * `MobileDisclosure`, acá el plegado vale en todos los tamaños de pantalla,
 * así que el problema de `::details-content` vs `sm:block` que obligó a aquel
 * a tener estado propio no aplica.
 *
 * Por qué plegado: el issue #176 §4 pide que las instrucciones de Conexiones
 * no compitan con la acción. El campo y el botón se quedan a la vista; lo que
 * se pliega es el "cómo consigo esto", que se lee una vez y después molesta.
 */
export function Disclosure({
  summary,
  children,
  open,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  /** Abierto de entrada (por ejemplo, cuando la app ya sabe que hace falta). */
  open?: boolean;
  className?: string;
}) {
  return (
    <details className={`group rounded-card border border-border bg-surface ${className}`} open={open}>
      {/* `list-none` + el marker de WebKit oculto: el chevron del set
          reemplaza al triángulo del navegador, que cada uno dibuja distinto. */}
      <summary className="flex min-h-11 cursor-pointer select-none list-none items-center justify-between gap-3 rounded-card px-3 py-2 type-meta font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <Icon
          name="chevron-down"
          className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border px-3 pb-3 pt-3">{children}</div>
    </details>
  );
}
