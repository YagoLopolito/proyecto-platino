import { test, expect } from "../fixtures/test";
import {
  AI_PLAN_SYSTEM_PROMPT,
  buildAiPlanUserPrompt,
  estimateTokens,
  INPUT_TOKEN_BUDGET,
} from "../../lib/ai/plan-prompt";
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

  test("AI-12: el plan lista los trofeos de acumulación con su objetivo", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Advisor Seis",
      np: 306,
    });

    await page.goto(`/juegos/${gameId}`);
    await page.getByRole("button", { name: "Generar plan" }).click();

    // El plan de fixture (`lib/ai/mocks.ts`) trae un acumulable
    // `bajas_con_condicion` que no se puede farmear después.
    await expect(page.getByRole("heading", { name: /Contadores a tener en cuenta/i })).toBeVisible();
    await expect(page.getByText("Bajas con condición")).toBeVisible();
    await expect(page.getByText("[E2E] 40 enemigos con el bláster.")).toBeVisible();
    // El aviso de que hay que ir sumándolo durante la historia es la razón de
    // ser de la sección: sin eso es una lista de trofeos más.
    await expect(page.getByText(/No se puede farmear después/i)).toBeVisible();
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

/**
 * AI-13: tamaño del prompt del plan. El free tier de Groq permite 8000 tokens
 * por minuto contando prompt + respuesta; con `max_tokens: 2800` de salida, la
 * entrada tiene que entrar en el presupuesto o el proveedor devuelve 413
 * `rate_limit_exceeded`. Le pasaba a los juegos de 50+ trofeos, que son justo
 * donde un plan sirve más.
 */
test.describe("Prompt del plan de IA", () => {
  const buildInput = (n: number, obtained: number) => ({
    gameName: "[E2E] Juego Grande",
    platform: "PS5",
    trophies: Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      name: `Nombre de trofeo razonablemente largo numero ${i + 1}`,
      description:
        "Derrota a 40 enemigos usando unicamente el blaster estandar durante la campana principal",
      type: (i === 0 ? "platinum" : "bronze") as "platinum" | "bronze",
      hidden: i % 7 === 0,
      obtained: i < obtained,
    })),
    guides: [],
  });

  for (const trofeos of [53, 80, 120]) {
    test(`AI-13: el prompt de un juego de ${trofeos} trofeos entra en el presupuesto`, async () => {
      const prompt = buildAiPlanUserPrompt(buildInput(trofeos, 0));
      const total = estimateTokens(AI_PLAN_SYSTEM_PROMPT) + estimateTokens(prompt);
      expect(total).toBeLessThanOrEqual(INPUT_TOKEN_BUDGET);
    });
  }

  /**
   * AI-14: el modelo marcaba como perdibles los trofeos que se desbloquean
   * solos avanzando la historia. El arreglo es del prompt, así que lo que se
   * verifica es que las reglas sigan estando (y que no se caigan en una
   * edición futura del system prompt).
   */
  test("AI-14: el prompt prohíbe marcar trofeos de historia como perdibles", async () => {
    expect(AI_PLAN_SYSTEM_PROMPT).toContain('NUNCA pongas en "missables" un trofeo de HISTORIA');
    expect(AI_PLAN_SYSTEM_PROMPT).toContain("punto de no retorno o el evento único que lo bloquea");
  });

  test("AI-13: los trofeos ya obtenidos no se mandan, sólo su cantidad", async () => {
    const prompt = buildAiPlanUserPrompt(buildInput(20, 8));

    expect(prompt).toContain("ya desbloqueó 8 de 20 trofeos");
    // Los ids de los 8 obtenidos (t1..t8) no aparecen; los pendientes sí.
    expect(prompt).not.toContain("t1|");
    expect(prompt).toContain("t9|");
  });
});
