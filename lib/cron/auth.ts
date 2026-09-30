import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ¿El header `Authorization` trae el `CRON_SECRET`? Sin secreto configurado,
 * nada pasa: el cron queda deshabilitado en vez de abierto.
 *
 * La comparación es en tiempo constante. Se comparan los SHA-256 y no los
 * strings: `timingSafeEqual` exige buffers del mismo largo (si no, tira), y
 * cortar antes por largo distinto filtraría el largo del secreto.
 *
 * Módulo puro y sin `server-only` a propósito: se testea desde el spec.
 */
export function isValidCronAuthorization(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
