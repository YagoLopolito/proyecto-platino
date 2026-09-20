export type SyncTokenStatus = "valid" | "expired" | "invalid";

/**
 * Estado de la conexión con una plataforma, como chip de color semántico.
 *
 * Los tres estados usan los tokens semánticos y no un verde/ámbar/rojo suelto:
 * "expirado" es `warning` porque el usuario lo arregla reconectando, y "falló"
 * es `danger` porque no hay dato. La diferencia no se apoya sólo en el color
 * -- cada chip lleva su texto al lado -- para no depender de distinguir
 * matices (WCAG 1.4.1).
 */
const STATUS_CONFIG: Record<SyncTokenStatus, { label: string; className: string }> = {
  valid: { label: "Sincronizado", className: "border-success/60 bg-success/10 text-success" },
  expired: {
    label: "Token expirado",
    className: "border-warning/60 bg-warning/10 text-warning",
  },
  invalid: { label: "Falló la sync", className: "border-danger/60 bg-danger/10 text-danger" },
};

export function SyncStatusBadge({
  status,
  className = "",
}: {
  status: SyncTokenStatus;
  className?: string;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.invalid;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 type-caption font-medium ${config.className} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
