export function ProgressBar({
  percent,
  className = "h-1.5",
}: {
  percent: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={`overflow-hidden rounded-full bg-surface-hover ${className}`}>
      <div className="h-full bg-accent" style={{ width: `${clamped}%` }} />
    </div>
  );
}
