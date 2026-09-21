import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

export type ConnectionStatus = "connected" | "attention" | "disconnected";

/*
 * El estado es un chip de color semántico (issue #176 §4): `success` para
 * conectada, `warning` para "necesita atención" (token vencido, perfil en
 * privado: la app sigue funcionando pero hay algo que hacer) y la tinta
 * apagada para "no conectada", que no es un problema sino un vacío. Los
 * ratios de cada combinación sobre su fondo `/10` están en ACCESSIBILITY.md.
 */
const STATUS_CONFIG: Record<ConnectionStatus, { label: string; className: string }> = {
  connected: { label: "Conectada", className: "border-success/40 bg-success/10 text-success" },
  attention: {
    label: "Necesita atención",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  disconnected: {
    label: "No conectada",
    className: "border-border-strong bg-surface-hover text-ink-muted",
  },
};

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      data-testid="connection-status"
      data-status={status}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 type-caption font-medium ${config.className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {config.label}
    </span>
  );
}

/**
 * Tarjeta de una plataforma conectable. Todo lo de esa plataforma vive adentro
 * -- estado, último sync, acciones y sus instrucciones propias -- para que
 * agregar una tercera no signifique repartir texto suelto por la página.
 *
 * Jerarquía: el nombre de la plataforma con su ícono y el chip de estado en la
 * primera línea; debajo, en metadatos, con quién está conectada y cuándo
 * sincronizó por última vez. Las acciones y las instrucciones van en el
 * cuerpo, que arma cada página.
 */
export function ConnectionCard({
  title,
  icon,
  status,
  subtitle,
  lastSyncedAt,
  children,
}: {
  title: string;
  /** Ícono de la plataforma (gamepad / monitor): genérico, no el logo. */
  icon: IconName;
  status: ConnectionStatus;
  subtitle?: ReactNode;
  lastSyncedAt: string | null;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-testid="connection-card"
      className="space-y-5 rounded-card border border-border bg-surface p-4 sm:p-6"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-chip bg-surface-raised text-ink-muted">
            <Icon name={icon} className="h-4 w-4" />
          </span>
          <h2 className="type-subtitle text-ink">{title}</h2>
          <ConnectionStatusBadge status={status} />
        </div>
        {subtitle && <div className="type-meta text-ink-muted">{subtitle}</div>}
        {status !== "disconnected" && (
          <p className="type-caption text-ink-faint">
            Última sincronización:{" "}
            {lastSyncedAt
              ? new Date(lastSyncedAt).toLocaleString("es-AR")
              : "todavía no se sincronizó"}
          </p>
        )}
      </div>

      {children}
    </section>
  );
}
