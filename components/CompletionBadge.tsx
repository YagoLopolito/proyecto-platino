/**
 * Equivalente al platino para Steam: el 100% de los logros.
 *
 * Va deliberadamente distinto al PlatinumBadge -- no son lo mismo (Steam no
 * tiene platino ni tipos de logro) y mezclarlos visualmente confundiría a
 * cualquiera que tenga las dos plataformas conectadas.
 */
export function CompletionBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.7-5.4 5.4a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 1 1 1.4-1.4l1.9 1.9 4.7-4.7a1 1 0 1 1 1.4 1.4Z" />
      </svg>
      100% completado
    </span>
  );
}
