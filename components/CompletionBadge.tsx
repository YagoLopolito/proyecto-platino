import { Icon } from "@/components/ui/Icon";

/**
 * Equivalente al platino para Steam: el 100% de los logros.
 *
 * Va deliberadamente distinto al PlatinumBadge -- no son lo mismo (Steam no
 * tiene platino ni tipos de logro) y mezclarlos visualmente confundiría a
 * cualquiera que tenga las dos plataformas conectadas. Lo que los separa es el
 * token: `success` (verde) acá, el celeste del platino allá.
 */
export function CompletionBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip border border-success/60 bg-success/10 px-2 py-0.5 type-caption font-medium text-success ${className}`}
    >
      <Icon name="completed" className="h-3 w-3" />
      100% completado
    </span>
  );
}
