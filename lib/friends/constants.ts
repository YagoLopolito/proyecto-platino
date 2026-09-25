/**
 * Cuántos usuarios lista el buscador de "Agregar amigo" de una sola vez.
 * Vive fuera de `actions.ts` porque un módulo `"use server"` solo puede
 * exportar funciones async (misma razón que `lib/catalog/constants.ts`).
 */
export const USER_SEARCH_LIMIT = 30;

/** Nombre a mostrar de un usuario: nombre de la plataforma elegida (PSN o Steam) primero, después el nombre de la app. */
export function profileLabel(profile: {
  displayName: string | null;
  profileName: string | null;
}): string {
  return profile.profileName ?? profile.displayName ?? "Usuario sin nombre";
}
