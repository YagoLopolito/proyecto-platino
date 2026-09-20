import { TrophyTypeIcon } from "./TrophyTypeIcon";

/**
 * Identificador visual de que un juego está platinado (tiene el trofeo
 * platino). El color es el token del trofeo platino, el mismo que pinta su
 * ícono: antes era un hex suelto repetido tres veces en la clase.
 */
export function PlatinumBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip border border-trophy-platinum/60 bg-trophy-platinum/10 px-2 py-0.5 type-caption font-medium text-trophy-platinum ${className}`}
    >
      <TrophyTypeIcon type="platinum" className="h-3 w-3" />
      Platinado
    </span>
  );
}
