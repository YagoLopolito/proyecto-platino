import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

/**
 * "Volver al diario", la misma pieza en las subpantallas del diario
 * (`/diario/capturas`, `/diario/resumen`).
 *
 * Estaba copiada tres veces con el carácter ← suelto delante: un glifo, no un
 * ícono, que no toma el grosor del set ni se alinea igual en cada sistema.
 */
export function BackToDiaryLink() {
  return (
    <Link
      href="/perfil/diario"
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-chip border border-border-strong px-3 type-meta font-medium text-ink-muted transition-colors hover:border-ink-muted hover:text-ink sm:min-h-0 sm:py-1.5"
    >
      <Icon name="arrow-left" className="h-4 w-4" />
      Volver al diario
    </Link>
  );
}
