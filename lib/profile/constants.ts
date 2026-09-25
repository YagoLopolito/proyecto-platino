/**
 * Cuántos juegos entran en el Top 5 del perfil.
 *
 * Vive acá y no en `queries.ts` porque lo necesitan también el editor (Client
 * Component) y la Server Action: `queries.ts` es `server-only` e importarlo
 * desde el cliente rompe el build (misma razón que `lib/catalog/constants.ts`).
 */
export const MAX_FAVORITE_GAMES = 5;

/** Largo máximo de la bio del perfil. Coincide con el `check` de `users.bio`. */
export const MAX_BIO_LENGTH = 160;

/** Plataformas con las que se puede mostrar el perfil (`users.profile_platform`). */
export const PROFILE_PLATFORMS = ["psn", "steam"] as const;
export type ProfilePlatform = (typeof PROFILE_PLATFORMS)[number];
