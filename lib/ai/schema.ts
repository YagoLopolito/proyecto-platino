import "server-only";
import { z } from "zod";

/**
 * Estructura del plan generado por IA para un juego (ver PRODUCT_SPEC.md sección 4).
 * `trofeo_id` referencia siempre a `trophies.id` (uuid interno), no al `trophy_id`
 * texto que usa la API de PSN, para poder cruzarlo directo con el resto de la app.
 */
export const aiGamePlanSchema = z.object({
  resumen: z.string().min(1),
  puede_platinar_en_una_run: z.boolean(),
  notas_run_unica: z.string(),
  grupos_de_partidas: z.array(
    z.object({
      run: z.number().int().positive(),
      objetivo: z.string().min(1),
      trofeos_relacionados: z.array(z.string()),
    }),
  ),
  missables: z.array(
    z.object({
      trofeo_id: z.string(),
      motivo: z.string().min(1),
      momento_limite: z.string(),
    }),
  ),
  orden_sugerido: z.array(z.string()),
  // El próximo trofeo concreto que conviene encarar, con los pasos para
  // conseguirlo. `.nullable().default(null)` para que los planes ya cacheados
  // en `ai_game_plans` (generados antes de este campo) sigan parseando.
  siguiente_trofeo: z
    .object({
      trofeo_id: z.string(),
      por_que: z.string(),
      pasos: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
  tips_generales: z.array(z.string()),
  // Trofeos que exigen una condición de dificultad/desafío (dificultad máxima,
  // speedrun, sin morir, permadeath, etc.). `.default([])` para que los planes
  // ya cacheados en `ai_game_plans` (generados antes de este campo) sigan
  // parseando sin migración ni regeneración.
  desafios_de_dificultad: z
    .array(
      z.object({
        trofeo_id: z.string(),
        categoria: z.enum([
          "dificultad_maxima",
          "speedrun",
          "sin_morir",
          "permadeath",
          "sin_recursos",
          "otro_desafio",
        ]),
        motivo: z.string().min(1),
        consejo: z.string(),
      }),
    )
    .default([]),
  // Trofeos de acumulación: piden una cantidad de algo (matar N enemigos de
  // cierta forma, juntar N coleccionables, repetir N veces una acción). No son
  // difíciles, pero si no se sabe que existen se llega al final de la historia
  // con el contador a medias y hay que rejugar o farmear. `.default([])` para
  // que los planes ya cacheados en `ai_game_plans` sigan parseando sin
  // regenerarse, misma razón que `desafios_de_dificultad`.
  acumulables: z
    .array(
      z.object({
        trofeo_id: z.string(),
        categoria: z.enum([
          "bajas_con_condicion",
          "coleccionables",
          "acciones_repetidas",
          "recursos",
          "progresion_larga",
        ]),
        objetivo: z.string().min(1),
        consejo: z.string(),
        // null = el modelo no se comprometió. false es la señal fuerte: no se
        // puede farmear después, hay que ir sumando durante la historia.
        se_puede_farmear: z.boolean().nullable().default(null),
      }),
    )
    .default([]),
  modos: z
    .array(
      z.object({
        modo: z.string().min(1),
        trofeos_relacionados: z.array(z.string()),
      }),
    )
    .default([]),
});

export type AiGamePlan = z.infer<typeof aiGamePlanSchema>;

/** Parsea y valida el JSON crudo devuelto por el modelo contra el schema del plan. */
export function parseAiGamePlan(raw: string): AiGamePlan {
  const json: unknown = JSON.parse(raw);
  return aiGamePlanSchema.parse(json);
}
