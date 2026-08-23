/**
 * Qué entra a "la biblioteca" del usuario.
 *
 * Es un filtro de **presentación**, no de datos: todo esto se sigue
 * sincronizando y guardando (y `/juegos/[id]` los abre igual, que es lo que
 * necesita el diario). Vive acá y no duplicado en cada página para que
 * `/juegos` y `/perfil` no puedan divergir en el conteo.
 */
export type LibraryVisibilityInput = {
  source: string | null;
  /**
   * Minutos jugados según Steam. NULL = no se sabe (juegos de PSN, catálogo y
   * carga manual, y también los de Steam sincronizados antes de que se guardara
   * este dato).
   */
  playtimeMinutes: number | null;
  /** Trofeos/logros ya desbloqueados en ese juego. */
  obtained: number;
};

export function isVisibleInLibrary({
  source,
  playtimeMinutes,
  obtained,
}: LibraryVisibilityInput): boolean {
  // Los juegos dados de alta desde "Marcar como terminado" viven solo en el
  // diario: no son parte de la biblioteca (decisión de producto previa).
  if (source === "catalog") return false;

  // Una biblioteca de Steam junta decenas de free-to-play reclamados y nunca
  // abiertos, demos y playtests. GetOwnedGames no dice qué tipo de app es cada
  // uno, así que el corte es "nunca lo jugó y no desbloqueó nada": si algún día
  // lo juega, el próximo sync lo hace aparecer solo.
  //
  // El cero tiene que ser explícito: NULL es "todavía no se sabe" (una fila
  // sincronizada antes de que existiera la columna), y tratarlo como cero
  // escondería juegos realmente jugados hasta el siguiente sync.
  if (source === "steam" && playtimeMinutes === 0 && obtained === 0) return false;

  return true;
}
