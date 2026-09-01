import "server-only";
import { AiSchemaValidationError } from "./errors";
import type { AiPlanInput, TrophyHintInput } from "./prompt";
import type { AiGamePlan } from "./schema";

/**
 * Mocks deterministas del advisor con IA para la suite E2E.
 *
 * El interruptor `E2E_MOCKS` se lee **solo acá adentro de `lib/`** (regla de
 * CLAUDE.md/TESTING_PRD.md §4): ninguna página, componente ni Server Action
 * sabe que existe. El free tier de Groq tiene rate limit bajo (30 req/min);
 * un test que llamara al proveedor real en cada corrida de CI daría 429 tarde
 * o temprano, así que el camino real queda para la suite `@live`.
 */
export const AI_MOCKS_ENABLED = process.env.E2E_MOCKS === "1";

/**
 * Fuerza el camino de error de schema, sin pegarle al proveedor real.
 *
 * `E2E_AI_FAIL=1` obliga a reiniciar el servidor con esa variable (todo el
 * proceso comparte el mismo `E2E_MOCKS`, arrancado una sola vez por
 * `playwright.config.ts`), así que además de leerse acá se puede disparar
 * **por request** con un nombre de juego que arranque con
 * `AI_FAIL_TRIGGER_PREFIX`: el test lo setea al seedear el juego, sin
 * necesitar un segundo `webServer` solo para este caso. Cualquiera de las dos
 * formas cae en el mismo error.
 */
export const AI_FAIL_TRIGGER_PREFIX = "[E2E-AI-FAIL]";

function shouldForceFailure(input: AiPlanInput): boolean {
  return process.env.E2E_AI_FAIL === "1" || input.gameName.startsWith(AI_FAIL_TRIGGER_PREFIX);
}

/**
 * Plan válido contra `aiGamePlanSchema`, construido con los `trofeo_id` que
 * realmente vinieron en el input (son ids cortos remapeados por el caller,
 * ver `app/(app)/juegos/[id]/ai-actions.ts`) para que el flujo completo --
 * generar, guardar, remapear a uuid real -- se pueda testear de punta a punta.
 */
export function getMockAiGamePlan(input: AiPlanInput): AiGamePlan {
  if (shouldForceFailure(input)) {
    throw new AiSchemaValidationError(new Error("E2E_AI_FAIL: fuerzo un plan inválido."));
  }

  const trophyIds = input.trophies.map((t) => t.id);
  const firstTrophy = trophyIds[0];

  return {
    resumen: `[E2E] Plan mockeado para ${input.gameName}.`,
    puede_platinar_en_una_run: false,
    notas_run_unica: "[E2E] Sin notas: plan de fixture, no generado por un modelo real.",
    grupos_de_partidas: [
      {
        run: 1,
        objetivo: "[E2E] Completar la campaña principal.",
        trofeos_relacionados: trophyIds,
      },
    ],
    missables: firstTrophy
      ? [
          {
            trofeo_id: firstTrophy,
            motivo: "[E2E] Se puede perder si no se hace en el capítulo correcto.",
            momento_limite: "[E2E] Antes del capítulo final.",
          },
        ]
      : [],
    desafios_de_dificultad: firstTrophy
      ? [
          {
            trofeo_id: firstTrophy,
            categoria: "dificultad_maxima" as const,
            motivo: "[E2E] Pide terminar el juego en la dificultad más alta.",
            consejo: "[E2E] Arrancá directo en esa dificultad para no rejugar.",
          },
        ]
      : [],
    orden_sugerido: trophyIds,
    siguiente_trofeo: firstTrophy
      ? {
          trofeo_id: firstTrophy,
          por_que: "[E2E] Es el más rápido de los que te faltan.",
          pasos: ["[E2E] Paso uno.", "[E2E] Paso dos."],
        }
      : null,
    tips_generales: ["[E2E] Guardá seguido.", "[E2E] Subí la dificultad al final si podés."],
    modos: [],
  };
}

/**
 * Ayuda de un solo trofeo, determinista. Mismo motivo que el plan: el free
 * tier de Groq no aguanta una llamada por trofeo en cada corrida de CI, y el
 * texto exacto es lo que asertan los tests del advisor.
 */
export function getMockTrophyHint(input: TrophyHintInput): string {
  return `[E2E] Ayuda mockeada para "${input.trophyName}".`;
}
