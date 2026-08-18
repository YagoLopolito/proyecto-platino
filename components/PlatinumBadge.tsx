import { TrophyTypeIcon } from "./TrophyTypeIcon";

/** Identificador visual de que un juego está platinado (tiene el trofeo platino). */
export function PlatinumBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[#B9D3E8]/60 bg-[#B9D3E8]/10 px-2 py-0.5 text-xs font-medium text-[#B9D3E8] ${className}`}
    >
      <TrophyTypeIcon type="platinum" className="h-3 w-3" />
      Platinado
    </span>
  );
}
