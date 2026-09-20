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
    <div className={`space-y-2 rounded-card border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Versalitas: es la etiqueta de una stat, el patrón de la referencia
            (ver `SectionHeader`), no un texto de lectura más. */}
        <span className="type-overline text-ink-faint">{label}</span>
        {icon}
      </div>
      <p className="type-stat">{value}</p>
      {children}
    </div>
  );
}
