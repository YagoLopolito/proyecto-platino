/**
 * Cuántos usuarios lista el buscador de "Agregar amigo" de una sola vez.
 * Vive fuera de `actions.ts` porque un módulo `"use server"` solo puede
 * exportar funciones async (misma razón que `lib/catalog/constants.ts`).
 */
export const USER_SEARCH_LIMIT = 30;

/** Nombre a mostrar de un usuario: PSN primero, después el nombre de la app. */
export function profileLabel(profile: {
  displayName: string | null;
  psnOnlineId: string | null;
}): string {
  return profile.psnOnlineId ?? profile.displayName ?? "Usuario sin nombre";
}
