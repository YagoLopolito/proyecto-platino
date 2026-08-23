import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";

/**
 * Advisor con IA (`AiAdvisorPanel.tsx` + `ai-actions.ts`). Casos AI-02 y AI-05
 * de TESTING_PRD.md §6.7 (los P0). `lib/ai/mocks.ts` responde con un plan de
 * fixture válido contra `aiGamePlanSchema` bajo `E2E_MOCKS=1`.
 */
test.describe("Advisor con IA", () => {
  test("AI-02: el label de contenido generado por IA está siempre visible", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Advisor Uno",
      np: 301,
    });

    await page.goto(`/juegos/${gameId}`);
    // Visible incluso sin haber generado nunca un plan (issue del panel: el
    // aviso no puede depender de que exista un resultado).
    await expect(page.getByText(/Contenido generado por IA/i)).toBeVisible();
    await expect(page.getByText("Todavía no se generó un plan para este juego.")).toBeVisible();
  });

  test("AI-05: un error de schema (fixture E2E_AI_FAIL) muestra el mensaje sin romper el panel", async ({
    page,
    supabase,
    users,
  }) => {
    // `lib/ai/mocks.ts`: un nombre de juego con este prefijo fuerza
    // AiSchemaValidationError sin tener que reiniciar el servidor con
    // E2E_AI_FAIL=1 (esa variable es de proceso completo, no por-request).
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Advisor Dos",
      np: 302,
    });
    await supabase
      .from("games")
      .update({ name: "[E2E-AI-FAIL] Advisor Dos" })
      .eq("id", gameId);

    await page.goto(`/juegos/${gameId}`);
    await page.getByRole("button", { name: "Generar plan" }).click();

    await expect(page.getByRole("alert")).toContainText(/formato inválido/i);
    // El panel sigue ahí, sin plan roto: el label de IA sigue visible.
    await expect(page.getByText(/Contenido generado por IA/i)).toBeVisible();
  });
});
