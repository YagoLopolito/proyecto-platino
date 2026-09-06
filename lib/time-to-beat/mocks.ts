import "server-only";

/**
 * Mock determinista de los tiempos estimados para la suite E2E.
 *
 * El interruptor `E2E_MOCKS` se lee **solo acá adentro de `lib/`** (regla de
 * CLAUDE.md): ninguna página, componente ni Server Action sabe que existe. En
 * Vercel la variable nunca está definida, así que el camino real (IGDB) es el
 * único que corre en producción. Además, IGDB necesita credenciales que CI no
 * tiene: sin este mock la suite saldría a internet en cada ficha.
 */

export const TIME_TO_BEAT_MOCKS_ENABLED = process.env.E2E_MOCKS === "1";

/** 12 h de historia, 30 h para el 100%. Números redondos y reconocibles. */
export const MOCK_BEAT_MINUTES = 12 * 60;
export const MOCK_COMPLETE_MINUTES = 30 * 60;

/**
 * Marcador en el nombre del juego para simular que IGDB no se pudo consultar
 * (credenciales, red, 401). Es el caso que NO se cachea, distinto de "IGDB no
 * conoce el juego".
 */
export const MOCK_UNAVAILABLE_MARKER = "SIN-IGDB";

export type MockTimeEstimates =
  | { status: "ok"; beatMinutes: number; completeMinutes: number }
  | { status: "not_found" }
  | { status: "unavailable" };

/**
 * Sólo responde con datos para los juegos de test (`[E2E]`). Un nombre con
 * `SIN-IGDB` simula el fallo de consulta; cualquier otro nombre devuelve "no
 * hay datos", que es el otro camino que la UI tiene que saber mostrar.
 */
export function mockTimeEstimates(gameName: string): MockTimeEstimates {
  if (gameName.includes(MOCK_UNAVAILABLE_MARKER)) return { status: "unavailable" };
  if (!gameName.startsWith("[E2E]")) return { status: "not_found" };
  return {
    status: "ok",
    beatMinutes: MOCK_BEAT_MINUTES,
    completeMinutes: MOCK_COMPLETE_MINUTES,
  };
}
