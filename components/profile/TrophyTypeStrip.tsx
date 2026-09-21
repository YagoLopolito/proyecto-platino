import {
  PSN_TROPHY_TYPES,
  TrophyTypeIcon,
  trophyTypeLabel,
  type PsnTrophyType,
} from "@/components/TrophyTypeIcon";

/**
 * Los cuatro totales de trofeo de PSN (bronce, plata, oro, platino) con el
 * patrón de tira de stats: número grande, etiqueta en versalitas, celdas
 * separadas por 1px. Antes era una tarjeta con cuatro tarjetas adentro, cada
 * una con su marco: cinco bordes para decir cuatro números.
 *
 * Compartida entre el perfil propio y el de otro usuario, que mostraban el
 * mismo bloque copiado. Sólo PSN: Steam no tiene tipos de logro (ver CLAUDE.md,
 * sección de Steam), y ese panel va aparte con sus propias unidades.
 */
export function TrophyTypeStrip({ counts }: { counts: Record<PsnTrophyType, number> }) {
  return (
    // 2 columnas en mobile (4 no entran sin achicar el ícono a algo ilegible)
    // y 4 a partir de sm.
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-4">
      {PSN_TROPHY_TYPES.map((type) => (
        <div key={type} className="flex items-center gap-3 bg-surface p-3 sm:p-4">
          <TrophyTypeIcon type={type} className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" />
          <div className="min-w-0">
            <dd className="type-stat text-ink">{counts[type]}</dd>
            <dt className="type-overline mt-0.5 text-ink-faint">{trophyTypeLabel(type)}</dt>
          </div>
        </div>
      ))}
    </dl>
  );
}
