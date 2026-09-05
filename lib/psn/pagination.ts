/**
 * Decisión de paginación de las listas de PSN, aislada como función pura para
 * poder testearla sin pegarle a la API real (no lleva `import "server-only"`
 * justamente por eso: no toca red ni secretos, es aritmética sobre la
 * respuesta).
 *
 * El endpoint de "juegos jugados" es inconsistente con la paginación: devuelve
 * páginas MÁS CHICAS que el `limit` pedido, y no siempre trae
 * `totalItemCount`. Los dos cortes obvios fallan por eso:
 *
 * - `titles.length < limit` corta en la primera página (páginas chicas).
 * - `offset >= totalItemCount` corta también en la primera cuando ese campo no
 *   viene: `?? 0` lo vuelve `offset >= 0`, verdadero siempre. Éste era el bug
 *   real: quedaban con horas sólo los primeros títulos de la lista, que está
 *   ordenada por juego más reciente.
 *
 * El único corte confiable es una página vacía. `totalItemCount` se usa sólo
 * cuando viene y es creíble, como atajo para ahorrar una request.
 */

export type PsnPageInfo = {
  titlesInPage: number;
  nextOffset?: number | null;
  totalItemCount?: number | null;
};

export type PsnPageDecision = { done: true } | { done: false; nextOffset: number };

export function decideNextPage(page: PsnPageInfo, currentOffset: number): PsnPageDecision {
  // Página vacía: no hay más nada, con o sin metadata de paginación.
  if (page.titlesInPage <= 0) return { done: true };

  // `nextOffset` es la señal que da el propio endpoint; se ignora si no avanza
  // (0, ausente o repetido), porque quedarse en el mismo offset es un ciclo.
  const advertised = typeof page.nextOffset === "number" ? page.nextOffset : null;
  const nextOffset =
    advertised !== null && advertised > currentOffset
      ? advertised
      : currentOffset + page.titlesInPage;

  const total = typeof page.totalItemCount === "number" ? page.totalItemCount : null;
  if (total !== null && total > 0 && nextOffset >= total) return { done: true };

  return { done: false, nextOffset };
}
