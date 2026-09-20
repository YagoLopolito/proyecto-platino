export function LoadingState({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 type-body text-ink-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-accent-ink" />
      {label}
    </div>
  );
}
