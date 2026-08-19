import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  children,
  className = "",
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      {children}
    </div>
  );
}
