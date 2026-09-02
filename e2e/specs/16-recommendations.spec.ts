import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";

async function countRecommendations(
  supabase: Parameters<typeof seedGameWithTrophies>[0],
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("ai_recommendations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "ok");
  return count ?? 0;
}

/**
 * "Recomendados para vos" en `/diario` (`RecommendationsSection.tsx` +
 * `recommendation-actions.ts`). Casos REC-01, REC-02 y REC-04 de
 * TESTING_PRD.md §6.15. `lib/ai/mocks.ts` responde con recomendaciones de
 * fixture bajo `E2E_MOCKS=1`: la suite nunca llama a Groq.
 *
 * `serial`: los tres comparten el mismo usuario y la misma tabla, y con
 * `fullyParallel` los de un mismo archivo también corren en paralelo -- las
 * cuentas de filas se pisarían entre sí.
 */
test.describe.serial("Recomendaciones del diario", () => {
  test("REC-01: el label de contenido generado por IA está siempre visible", async ({ page }) => {
    await page.goto("/diario");

    const section = page.getByRole("region", { name: "Recomendados para vos" });
    await expect(section.getByText(/Contenido generado por IA/i)).toBeVisible();
  });

  test("REC-02: generar guarda una fila ok y muestra qué seguir jugando y qué probar", async ({
    page,
    supabase,
    users,
  }) => {
    // Un juego platinado (define el gusto) y otro empezado a medias (el
    // candidato a "seguir jugando"): es el input mínimo del recomendador.
    const platinado = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 4,
      nameSuffix: "Reco Platinado",
      np: 401,
    });
    const enCurso = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 4,
      nameSuffix: "Reco En Curso",
      np: 402,
    });

    const unlockedAt = new Date().toISOString();
    await supabase.from("user_trophies").upsert(
      [
        ...platinado.trophyIds.map((trophyId) => ({
          user_id: users.userA.id,
          trophy_id: trophyId,
          unlocked_at: unlockedAt,
        })),
        { user_id: users.userA.id, trophy_id: enCurso.trophyIds[0], unlocked_at: unlockedAt },
      ],
      { onConflict: "user_id,trophy_id" },
    );

    const before = await countRecommendations(supabase, users.userA.id);

    await page.goto("/diario");
    await page.getByRole("button", { name: "Recomendame algo" }).click();

    const section = page.getByRole("region", { name: "Recomendados para vos" });
    await expect(section.getByRole("heading", { name: "Seguí jugando" })).toBeVisible();
    // El juego en curso sale como carátula; el platinado no, porque ahí ya no
    // queda nada para seguir jugando.
    await expect(section.getByRole("link", { name: /Reco En Curso/ })).toBeVisible();
    await expect(section.getByRole("link", { name: /Reco Platinado/ })).toHaveCount(0);
    // Un juego que el usuario no tiene, en "Para probar" (viene del mock).
    await expect(section.getByText("[E2E] Juego Recomendado")).toBeVisible();

    expect(await countRecommendations(supabase, users.userA.id)).toBe(before + 1);
  });

  test("REC-04: regenerar inserta una fila nueva y no pisa la anterior", async ({
    page,
    supabase,
    users,
  }) => {
    const before = await countRecommendations(supabase, users.userA.id);

    await page.goto("/diario");
    // REC-02 ya generó una vez: el botón arranca en "Actualizar".
    await page.getByRole("button", { name: "Actualizar recomendaciones" }).click();

    // El label del botón no cambia entre corridas, así que la señal de que
    // terminó es la fila nueva en la base, no un cambio en la UI.
    await expect
      .poll(() => countRecommendations(supabase, users.userA.id))
      .toBe(before + 1);

    // La anterior sigue estando: el historial es versionado, no un upsert.
    expect(before).toBeGreaterThan(0);
  });
});
