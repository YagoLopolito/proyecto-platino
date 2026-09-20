import type { ReactNode } from "react";

export function EmptyState({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-border p-8 text-center type-body text-ink-muted">
      <p>{title}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
