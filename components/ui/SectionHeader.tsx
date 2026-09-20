import type { ReactNode } from "react";

/**
 * Encabezado de sección al estilo Letterbox: versalitas chicas y espaciadas
 * sobre una regla fina, con una acción opcional a la derecha ("VER TODO").
 *
 * Reemplaza a los `<h2>` grandes que había antes: con la app llena de grillas
 * de carátulas, el título tiene que ordenar sin competir con las imágenes.
 */
export function SectionHeader({
  title,
  action,
  description,
  as: Heading = "h2",
}: {
  title: ReactNode;
  /** Link o botón alineado a la derecha, en la misma línea del título. */
  action?: ReactNode;
  description?: ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="space-y-1 border-b border-border pb-2">
      <div className="flex items-baseline justify-between gap-3">
        <Heading className="type-overline text-ink-faint">{title}</Heading>
        {action && <div className="type-overline shrink-0">{action}</div>}
      </div>
      {description && <p className="type-caption text-ink-muted">{description}</p>}
    </div>
  );
}

/** El link de acción de una `SectionHeader`, con el mismo tratamiento visual. */
export function SectionAction({ children }: { children: ReactNode }) {
  return (
    <span className="font-semibold text-ink-muted transition-colors hover:text-ink">
      {children}
    </span>
  );
}
