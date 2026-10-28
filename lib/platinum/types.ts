/**
 * Formas compartidas entre el servidor y los componentes cliente del platino.
 * Puro.
 */
import type { PlatinumPiece } from "./stats";

export interface PlatinumPrefs {
  /** Sonido de platino (celebración y lluvia de la ficha). */
  sound: boolean;
  /** Lluvia, reflejos y celebración animada. Off = el destaque queda estático. */
  effects: boolean;
}

export const DEFAULT_PLATINUM_PREFS: PlatinumPrefs = { sound: true, effects: true };

/** Un platino nuevo para celebrar, ya con su número en la colección. */
export type PlatinumCelebrationItem = PlatinumPiece;

/** Lo que devuelve `GET /api/platino/estado`. */
export interface PlatinumState {
  prefs: PlatinumPrefs;
  pending: PlatinumCelebrationItem[];
}
