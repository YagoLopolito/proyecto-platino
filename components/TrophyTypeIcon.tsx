export type TrophyType = "bronze" | "silver" | "gold" | "platinum";

const COLOR: Record<TrophyType, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#B9D3E8",
};

const LABEL: Record<TrophyType, string> = {
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
  platinum: "Platino",
};

/**
 * Ícono de trofeo por tipo. No reproducimos el asset oficial de Sony (sin
 * licencia para eso); es una copa estilizada con el color canónico de cada
 * tipo, suficiente para distinguirlos de un vistazo.
 */
export function TrophyTypeIcon({ type, className = "h-4 w-4" }: { type: TrophyType; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill={COLOR[type]}>
      <path d="M6 3h12v2h2a1 1 0 0 1 1 1v1c0 2.5-1.7 4.6-4 5.3-.7 1.6-2.1 2.8-3.8 3.2V18h2.3a1 1 0 0 1 1 1v1H8.5v-1a1 1 0 0 1 1-1H11.8v-2.5c-1.7-.4-3.1-1.6-3.8-3.2C5.7 11.6 4 9.5 4 7V6a1 1 0 0 1 1-1h1V3Zm0 4H5v0c0 1.5.8 2.8 2 3.6V7Zm12 0v3.6c1.2-.8 2-2.1 2-3.6h-1V7h-1Z" />
    </svg>
  );
}

export function trophyTypeLabel(type: TrophyType | string): string {
  return LABEL[type as TrophyType] ?? type;
}
