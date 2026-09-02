import "server-only";
import { AiSchemaValidationError } from "./errors";
import type { AiPlanInput, AiRecommendationsInput } from "./prompt";
import type { AiGamePlan, AiRecommendations } from "./schema";

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
    orden_sugerido: trophyIds,
    tips_generales: ["[E2E] Guardá seguido.", "[E2E] Subí la dificultad al final si podés."],
    modos: [],
  };
}

/** Nombre de juego nuevo que devuelve el mock del recomendador. */
export const MOCK_RECOMMENDED_GAME = "[E2E] Juego Recomendado";

/**
 * Recomendaciones deterministas para la suite E2E: usa los ids cortos que vino
 * en el input (los remapea el caller, ver `recommendation-actions.ts`) para que
 * el flujo completo -- generar, guardar, resolver el juego real -- se pueda
 * testear sin pegarle a Groq. `E2E_AI_FAIL=1` fuerza el camino de error igual
 * que en el plan.
 */
export function getMockAiRecommendations(input: AiRecommendationsInput): AiRecommendations {
  if (process.env.E2E_AI_FAIL === "1") {
    throw new AiSchemaValidationError(new Error("E2E_AI_FAIL: fuerzo recomendaciones inválidas."));
  }

  return {
    perfil: "[E2E] Perfil mockeado: te gustan los juegos de acción.",
    // Todos los juegos en curso, no los primeros N: la biblioteca del usuario
    // de test la comparten varios specs en paralelo, y recortar acá haría que
    // el juego que seedeó un test dependa de cuántos seedearon los otros.
    seguir_jugando: input.library.map((game, i) => ({
      juego_id: game.id,
      motivo: `[E2E] Te faltan ${game.total - game.obtained} trofeos para el platino.`,
      esfuerzo: (["poco", "medio", "mucho"] as const)[i % 3],
    })),
    nuevos: [
      {
        nombre: MOCK_RECOMMENDED_GAME,
        plataforma: "PS5",
        motivo: "[E2E] Porque platinaste juegos parecidos.",
      },
    ],
  };
}
