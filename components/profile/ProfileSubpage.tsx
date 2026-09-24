import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { APP_TIME_ZONE } from "@/lib/profile/stats";

/**
 * Marco de los expandidos de Estadísticas (`/perfil/jugados`,
 * `/perfil/platinos`…, issue #196): "Volver al perfil", el título y un
 * subtítulo con el número. No son tabs del perfil, por eso viven en su propio
 * grupo de rutas y no bajo las `SwipeTabs`.
 */
export function ProfileSubpage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Link
          href="/perfil"
          className="inline-flex min-h-11 items-center gap-1.5 type-meta font-medium text-ink-muted transition-colors hover:text-ink sm:min-h-0"
        >
          <Icon name="arrow-left" className="h-4 w-4" />
          Volver al perfil
        </Link>
        <div className="space-y-1">
          <h1 className="type-title text-ink">{title}</h1>
          {subtitle && <p className="type-meta text-ink-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

/** Fecha de un instante (`timestamptz`) en la zona de la app, "3 ene 2026". */
export function formatInstant(instant: string): string {
  return DATE_FORMAT.format(new Date(instant)).replace(".", "");
}
