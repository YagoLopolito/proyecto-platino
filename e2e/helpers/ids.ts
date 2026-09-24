/**
 * Identificadores de corrida. Todo lo que la suite escribe en la base real
 * lleva estos prefijos para que el teardown pueda limpiarlo sin tocar los
 * datos reales del usuario (TESTING_PRD.md seccion 3.3).
 */

/** Prefijo de todo `np_comm_id` creado por los tests. */
export const E2E_GAME_PREFIX = "E2E-";

/**
 * Prefijo de los `np_comm_id` que crea el sync mockeado de PSN
 * (`NP_COMM_PREFIX` de `lib/psn/mocks.ts`, hardcodeado allá porque `lib/` no
 * importa de `e2e/`). Arranca con `E2E_GAME_PREFIX`, así que el teardown lo
 * barre igual; existe aparte porque contar juegos por `E2E-%` a secas también
 * cuenta los que seedean los otros specs en el worker de al lado.
 */
export const E2E_PSN_MOCK_PREFIX = `${E2E_GAME_PREFIX}PSN-MOCK-`;

/** Prefijo visible de todo `games.title` creado por los tests. */
export const E2E_TITLE_PREFIX = "[E2E]";

/**
 * Los juegos de Steam que crean los mocks no tienen np_comm_id (es una columna
 * de PSN), así que el teardown los identifica por su appid: los de test viven
 * arriba de este número. Tiene que coincidir con E2E_MOCK_APPID_MIN de
 * lib/steam/mocks.ts.
 */
export const E2E_STEAM_APPID_MIN = 999_000_000;

/**
 * Ids de IGDB de los mocks (`lib/igdb/mocks.ts`): los juegos y estudios de test
 * viven arriba de este número, muy por encima de los reales. El teardown limpia
 * `games` y `companies` por acá.
 */
export const E2E_IGDB_ID_MIN = 900_000_000;

/** Dominio reservado por RFC 2606: nunca sale un mail real. */
export const E2E_EMAIL_DOMAIN = "proyecto-platino.test";

/**
 * Id unico de esta corrida. Se propaga a los workers por env var para que
 * todos los procesos de Playwright compartan el mismo, y el teardown pueda
 * limpiar exactamente lo que creo esta corrida.
 */
export function getRunId(): string {
  const existing = process.env.E2E_RUN_ID;
  if (existing) return existing;
  const generated = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  process.env.E2E_RUN_ID = generated;
  return generated;
}

export function testEmail(suffix: string): string {
  return `e2e+${getRunId()}-${suffix}@${E2E_EMAIL_DOMAIN}`;
}

/** Password de los usuarios de test. No protege nada: las cuentas se borran al terminar. */
export const TEST_PASSWORD = "e2e-Platino-2026!";

export function testGameCommId(n: number): string {
  return `${E2E_GAME_PREFIX}${getRunId()}-${n}`;
}

export function testGameTitle(name: string): string {
  return `${E2E_TITLE_PREFIX} ${name}`;
}
