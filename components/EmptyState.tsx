import type { ReactNode } from "react";

export function EmptyState({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">
      <p>{title}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
