import { PlatinumTrophy } from "./PlatinumTrophy";

/** Marca de una publicación de platino en la Galería online (feed, grilla, detalle). */
export function PlatinumPostBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="flex drop-shadow-[0_0_6px_var(--platinum-glow)]">
        <PlatinumTrophy size={22} label="Platino" />
      </span>
    );
  }
  return (
    <span
      data-testid="platinum-post-badge"
      className="inline-flex items-center gap-1.5 rounded-chip border border-trophy-platinum/60 bg-platinum-glow px-2 py-0.5 type-caption font-semibold text-trophy-platinum"
    >
      <PlatinumTrophy size={16} />
      ¡Platino!
    </span>
  );
}
