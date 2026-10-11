/**
 * El mensaje crudo de Postgres/PostgREST/Storage nunca llega al cliente
 * (issue #165): nombra tablas, columnas, constraints y policies de RLS, un
 * mapa gratis de la base. El detalle queda en los logs del server (Vercel) y
 * el usuario ve un texto propio.
 *
 * Sin `server-only` a propósito: no toca nada secreto, y algunos módulos que
 * lo usan (`lib/activity/queries.ts`) devuelven su resultado a Client
 * Components a través de una Server Action.
 */

/** Lo que traen los errores de supabase-js (PostgrestError, StorageError, ...). */
export type DbErrorLike = {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
};

/** Texto para el usuario cuando una lectura falla y no hay nada más útil que decir. */
export const GENERIC_DB_ERROR = "Probá de nuevo en un rato.";

export function logDbError(scope: string, error: DbErrorLike | unknown): void {
  if (error && typeof error === "object" && "message" in error) {
    const { code, message, details, hint } = error as DbErrorLike;
    console.error(`[db] ${scope}`, { code, message, details, hint });
    return;
  }
  console.error(`[db] ${scope}`, error);
}

/**
 * Loguea el error y devuelve `userMessage`, para usar en el `return` de una
 * Server Action: `return { error: dbErrorMessage("lists.save", error, "No se
 * pudo guardar la lista.") }`.
 */
export function dbErrorMessage(
  scope: string,
  error: DbErrorLike | unknown,
  userMessage: string = GENERIC_DB_ERROR,
): string {
  logDbError(scope, error);
  return userMessage;
}
