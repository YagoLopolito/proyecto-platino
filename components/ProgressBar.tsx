export function ProgressBar({ percent, className = "h-1.5" }: { percent: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={`overflow-hidden rounded-full bg-zinc-800 ${className}`}>
      <div className="h-full bg-blue-600" style={{ width: `${clamped}%` }} />
    </div>
  );
}
