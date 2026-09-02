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
  tips_generales: z.array(z.string()),
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

/**
 * Recomendaciones del diario ("Recomendados para vos"). `juego_id` referencia
 * un id corto ("g1", "g2", ...) que el caller remapea al uuid real de `games`
 * antes de guardar, igual que los trofeos del plan.
 */
export const aiRecommendationsSchema = z.object({
  perfil: z.string().min(1),
  seguir_jugando: z
    .array(
      z.object({
        juego_id: z.string(),
        motivo: z.string().min(1),
        // El modelo a veces devuelve otra palabra ("bajo", "alto"): se
        // normaliza a "medio" en vez de invalidar toda la respuesta por un
        // adjetivo, que obligaría a un reintento completo.
        esfuerzo: z
          .string()
          .transform((value) => value.toLowerCase().trim())
          .pipe(z.enum(["poco", "medio", "mucho"]).catch("medio")),
      }),
    )
    .default([]),
  nuevos: z
    .array(
      z.object({
        nombre: z.string().min(1),
        plataforma: z.string().default(""),
        motivo: z.string().min(1),
      }),
    )
    .default([]),
});

export type AiRecommendations = z.infer<typeof aiRecommendationsSchema>;

/** Parsea y valida el JSON crudo del recomendador contra su schema. */
export function parseAiRecommendations(raw: string): AiRecommendations {
  const json: unknown = JSON.parse(raw);
  return aiRecommendationsSchema.parse(json);
}
