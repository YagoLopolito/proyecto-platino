/**
 * Freno de frecuencia para las acciones caras que dispara el usuario a mano
 * (issue #128). Puro y sin `server-only`: lo usan la ruta de sync, el botón y
 * la Server Action del advisor, y se testea directo desde el spec.
 *
 * El cron (`/api/cron/sync`) NO pasa por acá: corre una vez por día y tiene que
 * sincronizar aunque el usuario haya sincronizado a mano un rato antes.
 */

/** Mínimo entre dos syncs manuales de PSN. */
export const PSN_SYNC_COOLDOWN_MS = 10 * 60 * 1000;

/** Mínimo entre dos planes de IA del mismo juego para el mismo usuario. */
export const AI_PLAN_COOLDOWN_MS = 5 * 60 * 1000;

/** Milisegundos que faltan para poder repetir la acción (0 si ya se puede). */
export function cooldownRemainingMs(
  lastAt: string | null | undefined,
  cooldownMs: number,
  now: number = Date.now(),
): number {
  if (!lastAt) return 0;
  const last = Date.parse(lastAt);
  if (Number.isNaN(last)) return 0;
  return Math.max(0, last + cooldownMs - now);
}

/** "1 minuto", "7 minutos": siempre redondea para arriba, nunca "0 minutos". */
export function formatCooldown(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}
