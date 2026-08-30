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

    // La página tiene un segundo role="alert" (el route-announcer de Next,
    // siempre vacío) -- hay que acotar al del panel de IA.
    await expect(page.getByRole("alert").filter({ hasText: /formato inválido/i })).toBeVisible();
    // El panel sigue ahí, sin plan roto: el label de IA sigue visible.
    await expect(page.getByText(/Contenido generado por IA/i)).toBeVisible();
  });

  test("AI-09: el plan marca los trofeos de dificultad con su categoría", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Advisor Tres",
      np: 303,
    });

    await page.goto(`/juegos/${gameId}`);
    await page.getByRole("button", { name: "Generar plan" }).click();

    // El plan de fixture (`lib/ai/mocks.ts`) trae un desafío
    // `dificultad_maxima` sobre el primer trofeo.
    await expect(page.getByRole("heading", { name: /Trofeos de dificultad/i })).toBeVisible();
    await expect(page.getByText("Dificultad máxima")).toBeVisible();
    await expect(
      page.getByText("[E2E] Pide terminar el juego en la dificultad más alta."),
    ).toBeVisible();
  });

  test("AI-10: clickear un trofeo del plan lleva al trofeo y abre su ayuda", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 3,
      nameSuffix: "Advisor Cuatro",
      np: 304,
    });

    await page.goto(`/juegos/${gameId}`);
    await page.getByRole("button", { name: "Generar plan" }).click();

    const advisor = page.locator("#advisor");
    const chip = advisor
      .getByRole("button", { name: /Advisor Cuatro - Trofeo 1/ })
      .first();
    await expect(chip).toBeVisible();
    await chip.click();

    // El trofeo de la lista de arriba queda enfocado y con la ayuda ya pedida:
    // el usuario no tiene que buscarlo ni volver a clickear "Cómo desbloquearlo".
    const trophyRow = page.locator(`#trofeo-${trophyIds[0]}`);
    await expect(trophyRow.getByText(/\[E2E\] Ayuda mockeada/)).toBeVisible();
    await expect(trophyRow.getByRole("button", { name: "Ocultar ayuda" })).toBeVisible();
  });

  test("AI-11: la tarjeta de siguiente trofeo muestra el trofeo pendiente y sus pasos", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 3,
      nameSuffix: "Advisor Cinco",
      np: 305,
    });

    await page.goto(`/juegos/${gameId}`);
    await page.getByRole("button", { name: "Generar plan" }).click();

    const advisor = page.locator("#advisor");
    await expect(advisor.getByRole("heading", { name: /Siguiente trofeo/i })).toBeVisible();
    await expect(advisor.getByText("[E2E] Es el más rápido de los que te faltan.")).toBeVisible();
    await expect(advisor.getByText("[E2E] Paso uno.")).toBeVisible();

    // La tarjeta es un atajo al trofeo de la lista de arriba, igual que los chips.
    await advisor.getByRole("button", { name: /Advisor Cinco - Trofeo 1/ }).first().click();
    await expect(
      page.locator(`#trofeo-${trophyIds[0]}`).getByText(/\[E2E\] Ayuda mockeada/),
    ).toBeVisible();
  });
});
