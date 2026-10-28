/**
 * Cuándo un platino que trae el sync merece la celebración de pantalla
 * completa. Puro y sin `server-only` (se testea desde el spec).
 *
 * `user_trophies.celebrated_at` nace en `now()` (ver la migración
 * `20261028000000_platinum_impact.sql`): todo lo viejo cuenta como ya
 * celebrado y el sync sólo lo pone en NULL cuando esto devuelve true.
 */

/** Un platino de hace más que esto no se celebra: no es "nuevo" para nadie. */
export const CELEBRATION_WINDOW_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function shouldCelebratePlatinum(input: {
  /** La fila de `user_trophies` del platino ya existía antes de este sync. */
  alreadyHad: boolean;
  /**
   * La cuenta ya se había sincronizado alguna vez. En el primer sync todo lo
   * que llega es historia, no un logro de hoy: sin esto, una biblioteca de 200
   * juegos encolaba 40 celebraciones.
   */
  hadPreviousSync: boolean;
  earnedAt: string | null;
  now?: Date;
}): boolean {
  const { alreadyHad, hadPreviousSync, earnedAt, now = new Date() } = input;
  if (alreadyHad || !hadPreviousSync || !earnedAt) return false;
  const earned = Date.parse(earnedAt);
  if (Number.isNaN(earned)) return false;
  const age = now.getTime() - earned;
  // Un desbloqueo "en el futuro" (relojes desfasados) también es reciente.
  return age <= CELEBRATION_WINDOW_DAYS * MS_PER_DAY;
}
