/**
 * Freno de frecuencia para las acciones caras que dispara el usuario a mano
 * (issue #128). Puro y sin `server-only`: lo usan la ruta de sync, el botón y
 * las Server Actions de IA, y se testea directo desde el spec.
 *
 * El cron (`/api/cron/sync`) NO pasa por acá: corre una vez por día y tiene que
 * sincronizar aunque el usuario haya sincronizado a mano un rato antes.
 */

/** Mínimo entre dos syncs manuales de PSN. */
export const PSN_SYNC_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Mínimo entre dos syncs manuales de Steam (#159). Cada sync son hasta 3
 * llamadas por juego contra una cuota de 100.000 por día compartida por toda
 * la app: un usuario en loop deja sin sync a todos los demás.
 */
export const STEAM_SYNC_COOLDOWN_MS = 10 * 60 * 1000;

/** Mínimo entre dos planes de IA del mismo juego para el mismo usuario. */
export const AI_PLAN_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Mínimo entre dos generaciones de recomendaciones de IA del mismo usuario
 * (#159). Mismo criterio que el plan: el free tier de Groq es por organización.
 */
export const AI_RECOMMENDATIONS_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Mínimo entre dos búsquedas de enlaces externos del mismo juego (#159). Es por
 * juego y no por usuario: los enlaces son catálogo compartido, y lo que se
 * protege es la cuota de la `STEAM_API_KEY`.
 */
export const EXTERNAL_GUIDES_COOLDOWN_MS = 10 * 60 * 1000;

/** Un tope de una ventana deslizante: como mucho `max` pedidos cada `windowMs`. */
export type RateLimit = { windowMs: number; max: number };

/**
 * Topes de la ayuda de un trofeo con IA por usuario (#235). No hay una marca
 * única que mirar (la ayuda no se guarda): cada pedido deja una fila en
 * `ai_usage`, y la cuenta la hace la función `claim_ai_usage` de la base, que
 * cuenta y anota en un solo paso. El de un minuto frena un loop; el diario, un
 * goteo constante.
 */
export const TROPHY_HINT_LIMITS: readonly RateLimit[] = [
  { windowMs: 60 * 1000, max: 10 },
  { windowMs: 24 * 60 * 60 * 1000, max: 100 },
];

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
