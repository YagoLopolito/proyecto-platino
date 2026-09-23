/**
 * Límites de las listas (epic #183, issue #189). Módulo puro, sin
 * `server-only`: los usan el editor (client) y las Server Actions, y tienen
 * que coincidir con los `check` de la migración `20260923030000_user_lists`.
 */
export const MAX_LIST_ITEMS = 250;
export const MAX_LIST_TITLE = 100;
export const MAX_LIST_DESCRIPTION = 2000;
export const MAX_LIST_NOTE = 280;

export type ListVisibility = "public" | "private";
