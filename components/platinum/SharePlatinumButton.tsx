"use client";

import { Icon } from "@/components/ui/Icon";
import { usePlatinum } from "./PlatinumProvider";
import type { PlatinumPiece } from "@/lib/platinum/stats";

/** Botón chico de "Compartir en actividad" (cada pieza de la vitrina). */
export function SharePlatinumButton({ piece }: { piece: PlatinumPiece }) {
  const { openShare } = usePlatinum();
  return (
    <button
      type="button"
      onClick={() => openShare(piece)}
      aria-label={`Compartir el platino de ${piece.name} en actividad`}
      title="Compartir en actividad"
      className="flex h-11 w-11 items-center justify-center rounded-chip text-ink-faint transition-colors hover:text-trophy-platinum focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:h-8 sm:w-8"
    >
      <Icon name="upload" className="h-4 w-4" />
    </button>
  );
}
