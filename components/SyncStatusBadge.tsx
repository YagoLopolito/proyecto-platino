export type SyncTokenStatus = "valid" | "expired" | "invalid";

const STATUS_CONFIG: Record<SyncTokenStatus, { label: string; className: string }> = {
  valid: { label: "Sincronizado", className: "border-green-600 bg-green-500/10 text-green-400" },
  expired: {
    label: "Token expirado",
    className: "border-amber-600 bg-amber-500/10 text-amber-400",
  },
  invalid: { label: "Falló la sync", className: "border-red-600 bg-red-500/10 text-red-400" },
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
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.className} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
