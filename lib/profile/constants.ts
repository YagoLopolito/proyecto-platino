/**
 * Cuántos juegos entran en el Top 5 del perfil.
 *
 * Vive acá y no en `queries.ts` porque lo necesitan también el editor (Client
 * Component) y la Server Action: `queries.ts` es `server-only` e importarlo
 * desde el cliente rompe el build (misma razón que `lib/catalog/constants.ts`).
 */
export const MAX_FAVORITE_GAMES = 5;
