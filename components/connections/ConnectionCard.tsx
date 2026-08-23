import type { ReactNode } from "react";

export type ConnectionStatus = "connected" | "attention" | "disconnected";

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; className: string }> = {
  connected: { label: "Conectada", className: "border-green-600 bg-green-500/10 text-green-400" },
  attention: {
    label: "Necesita atención",
    className: "border-amber-600 bg-amber-500/10 text-amber-400",
  },
  disconnected: {
    label: "No conectada",
    className: "border-zinc-600 bg-zinc-700/20 text-zinc-400",
  },
};

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      data-testid="connection-status"
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}

/**
 * Tarjeta de una plataforma conectable. Todo lo de esa plataforma vive adentro
 * -- estado, último sync, acciones y sus instrucciones propias -- para que
 * agregar una tercera no signifique repartir texto suelto por la página.
 */
export function ConnectionCard({
  title,
  status,
  subtitle,
  lastSyncedAt,
  children,
}: {
  title: string;
  status: ConnectionStatus;
  subtitle?: ReactNode;
  lastSyncedAt: string | null;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-testid="connection-card"
      className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
          <ConnectionStatusBadge status={status} />
        </div>
        {subtitle && <div className="text-sm text-zinc-400">{subtitle}</div>}
        {status !== "disconnected" && (
          <p className="text-sm text-zinc-400">
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
