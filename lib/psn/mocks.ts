import "server-only";
import type { PsnIdentity } from "./auth";
import type { FetchedTitle } from "./trophies";
import { NpssoExpiredError } from "./errors";

/**
 * Mocks deterministas de la integración con PSN para la suite E2E.
 *
 * El interruptor `E2E_MOCKS` se lee **solo acá adentro de `lib/`** (regla de
 * CLAUDE.md/TESTING_PRD.md §4): ninguna página, componente ni Server Action
 * sabe que existe. En Vercel la variable nunca está definida, así que el
 * camino real (`psn-api` contra PSN) es el único que corre en producción.
 *
 * Sony bloquea el intercambio de NPSSO desde IPs de datacenter (ver
 * CLAUDE.md), así que en CI un NPSSO real no funciona nunca -- de acá sale
 * toda la cobertura de PSN que no está etiquetada `@live`.
 */
export const PSN_MOCKS_ENABLED = process.env.E2E_MOCKS === "1";

/** NPSSO de fixture que "conecta" con éxito (TESTING_PRD.md §4.1). */
export const MOCK_VALID_NPSSO = "E2E-VALID-NPSSO";
/** NPSSO de fixture que simula un token vencido. */
export const MOCK_EXPIRED_NPSSO = "E2E-EXPIRED-NPSSO";

const MOCK_ACCOUNT_ID = "999000000001";
const MOCK_ONLINE_ID = "E2E_PsnUser";

/**
 * `np_comm_id` de los juegos mockeados. Hardcodeado a mano (no se importa
 * `e2e/helpers/ids.ts` desde `lib/`, que es código de producción) pero tiene
 * que arrancar igual que `E2E_GAME_PREFIX` ("E2E-") de ese archivo para que
 * el teardown de la suite (`cleanupTestData`, que borra `games` por
 * `np_comm_id like 'E2E-%'`) se lleve también estos juegos.
 */
const NP_COMM_PREFIX = "E2E-PSN-MOCK-";
/** Mismo criterio que `E2E_TITLE_PREFIX` de `e2e/helpers/ids.ts`. */
const TITLE_PREFIX = "[E2E]";

function mockTrophySummary() {
  return {
    level: 12,
    progressPercent: 40,
    tier: 3,
    earned: { platinum: 1, gold: 2, silver: 3, bronze: 6 },
  };
}

/**
 * Identidad devuelta por la conexión de cuenta (`connectPsnAccount`) cuando
 * el NPSSO pegado es el de fixture. Cualquier otro valor que no sea el
 * vencido tira un error genérico -- así se ejercita el tercer camino del
 * contrato de §4.1 ("cualquier otro NPSSO -> error genérico").
 */
export function getMockPsnIdentity(npsso: string): PsnIdentity {
  if (npsso === MOCK_EXPIRED_NPSSO) {
    throw new NpssoExpiredError();
  }
  if (npsso !== MOCK_VALID_NPSSO) {
    throw new Error("NPSSO mock desconocido: no matchea ningún fixture de E2E_MOCKS.");
  }
  return {
    accountId: MOCK_ACCOUNT_ID,
    onlineId: MOCK_ONLINE_ID,
    avatarUrl: null,
    trophySummary: mockTrophySummary(),
  };
}

function makeTrophy(
  npTrophyId: number,
  name: string,
  type: FetchedTitle["trophies"][number]["type"],
  earned: boolean,
): FetchedTitle["trophies"][number] {
  return {
    npTrophyId,
    name: `${TITLE_PREFIX} ${name}`,
    description: `Trofeo de prueba (${name}).`,
    type,
    hidden: false,
    iconUrl: null,
    sortOrder: npTrophyId,
    earned,
    earnedAt: earned ? "2026-01-10T12:00:00.000Z" : null,
    groupId: "default",
    rarity: earned ? 2 : null,
    earnedRate: earned ? "25.00" : null,
    progressTarget: null,
  };
}

/**
 * 3 juegos `[E2E]` con ~12 trofeos en total, uno de ellos platinado al 100%
 * (TESTING_PRD.md §4.1). Usado por `syncTrophiesForUser` en vez de la llamada
 * real a `fetchUserTitlesWithTrophies` cuando `E2E_MOCKS=1`.
 */
export function getMockTitles(): FetchedTitle[] {
  return [
    {
      npCommId: `${NP_COMM_PREFIX}1`,
      name: `${TITLE_PREFIX} PSN Game Uno`,
      iconUrl: null,
      platform: "PS5",
      lastPlayedAt: "2026-01-10T12:00:00.000Z",
      groups: [],
      trophies: [
        makeTrophy(1, "Bronce 1", "bronze", true),
        makeTrophy(2, "Bronce 2", "bronze", true),
        makeTrophy(3, "Plata 1", "silver", true),
        makeTrophy(4, "Oro 1", "gold", true),
        makeTrophy(5, "Platino", "platinum", true),
      ],
    },
    {
      npCommId: `${NP_COMM_PREFIX}2`,
      name: `${TITLE_PREFIX} PSN Game Dos`,
      iconUrl: null,
      platform: "PS4",
      lastPlayedAt: "2026-01-05T12:00:00.000Z",
      groups: [],
      trophies: [
        makeTrophy(1, "Bronce 1", "bronze", true),
        makeTrophy(2, "Bronce 2", "bronze", false),
        makeTrophy(3, "Plata 1", "silver", false),
        makeTrophy(4, "Oro 1", "gold", false),
      ],
    },
    {
      npCommId: `${NP_COMM_PREFIX}3`,
      name: `${TITLE_PREFIX} PSN Game Tres`,
      iconUrl: null,
      platform: "PS5",
      lastPlayedAt: null,
      groups: [],
      trophies: [
        makeTrophy(1, "Bronce 1", "bronze", false),
        makeTrophy(2, "Plata 1", "silver", false),
        makeTrophy(3, "Oro 1", "gold", false),
      ],
    },
  ];
}
