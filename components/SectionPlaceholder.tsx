import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { IconName } from "@/components/ui/Icon";

/**
 * Pantalla de una sub-sección que todavía no existe (epic #183). El shell de
 * navegación (#185) se mergea antes que las features, así que cada tab tiene
 * que llevar a algún lado: esto dice qué va a haber ahí, en vez de un 404 o
 * una pantalla en blanco.
 *
 * Tiene el mismo contenedor que las pantallas de listado (`max-w-5xl`) para
 * que al reemplazarla por la feature real no salte el layout.
 */
export function SectionPlaceholder({
  icon,
  title,
  description,
  children,
}: {
  icon: IconName;
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {children}
        <EmptyState icon={icon} title={title} description={description} />
      </div>
    </div>
  );
}
