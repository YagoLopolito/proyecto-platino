/**
 * Esqueletos de carga de la Galería online: la forma de lo que va a llegar
 * (no un spinner), para que la página no salte cuando aparece el contenido.
 * El pulso se apaga con `prefers-reduced-motion`.
 */
const pulse = "animate-pulse motion-reduce:animate-none bg-surface-hover";

export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-6" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="space-y-3 sm:rounded-card sm:border sm:border-border sm:bg-surface sm:p-4"
        >
          <div className="flex items-center gap-3 px-3 sm:px-0">
            <span className={`h-9 w-9 rounded-full ${pulse}`} />
            <span className="space-y-1.5">
              <span className={`block h-3 w-32 rounded-chip ${pulse}`} />
              <span className={`block h-2.5 w-20 rounded-chip ${pulse}`} />
            </span>
          </div>
          <div className={`aspect-video w-full sm:rounded-chip ${pulse}`} />
          <div className="space-y-2 px-3 sm:px-0">
            <span className={`block h-3 w-24 rounded-chip ${pulse}`} />
            <span className={`block h-3 w-3/4 rounded-chip ${pulse}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-0.5 sm:gap-1 lg:gap-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`aspect-square lg:rounded-chip ${pulse}`} />
      ))}
    </div>
  );
}
