/**
 * Mínimo de caracteres para disparar la búsqueda de catálogo. Vive fuera de
 * `actions.ts` porque un módulo `"use server"` solo puede exportar funciones
 * async, y este valor lo necesitan tanto la Server Action como el combobox.
 */
export const MIN_QUERY_LENGTH = 3;
