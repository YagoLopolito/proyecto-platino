import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";

/**
 * Guías propias (`/juegos/[id]/guias`). Casos GUIDE-05, GUIDE-06, GUIDE-07 de
 * TESTING_PRD.md §6.5 (los P0).
 */
test.describe("Guías propias", () => {
  test("GUIDE-05: tildar un paso persiste tras recargar", async ({ page, supabase, users }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Guía Uno",
      np: 201,
    });

    await page.goto(`/juegos/${gameId}/guias`);
    await page.getByText("+ Crear una guía propia (opcional)").click();
    await page.getByLabel("Título").fill("[E2E] Guía de prueba");
    await page.getByLabel(/Contenido en markdown/i).fill("Paso a paso de prueba.");
    await page.getByRole("button", { name: "Crear guía" }).click();
    await expect(page.getByRole("heading", { name: "[E2E] Guía de prueba" })).toBeVisible();

    await page.getByPlaceholder("Descripción del paso").fill("Primer paso de la guía");
    await page.getByRole("button", { name: "Agregar paso" }).click();
    await expect(page.getByText("Primer paso de la guía")).toBeVisible();

    await page.getByRole("button", { name: "Tildar paso" }).click();
    await expect(page.getByRole("button", { name: "Destildar paso" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Destildar paso" })).toBeVisible();
  });

  test("GUIDE-06: un paso ligado a un trofeo ya obtenido aparece tildado solo", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Guía Dos",
      np: 202,
    });
    await supabase.from("user_trophies").upsert(
      { user_id: users.userA.id, trophy_id: trophyIds[0], unlocked_at: new Date().toISOString() },
      { onConflict: "user_id,trophy_id" },
    );

    await page.goto(`/juegos/${gameId}/guias`);
    await page.getByText("+ Crear una guía propia (opcional)").click();
    await page.getByLabel("Título").fill("[E2E] Guía auto-tilde");
    await page.getByLabel(/Contenido en markdown/i).fill("Contenido.");
    await page.getByRole("button", { name: "Crear guía" }).click();
    await expect(page.getByRole("heading", { name: "[E2E] Guía auto-tilde" })).toBeVisible();

    await page.getByPlaceholder("Descripción del paso").fill("Paso ligado al trofeo ya obtenido");
    await page.locator('select[name="trophyId"]').selectOption(trophyIds[0]);
    await page.getByRole("button", { name: "Agregar paso" }).click();

    // El botón queda deshabilitado (issue #18): el checklist no puede
    // destildar algo que ya está confirmado por el sync.
    const step = page.getByText("Paso ligado al trofeo ya obtenido").locator("..");
    await expect(step.getByRole("button", { name: "Destildar paso" })).toBeDisabled();
  });

  test("GUIDE-07: userB no puede editar la guía de userA", async ({
    browser,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Guía Ajena",
      np: 203,
    });

    const { data: guide } = await supabase
      .from("guides")
      .insert({
        game_id: gameId,
        author_id: users.userA.id,
        title: "[E2E] Guía de userA",
        content_markdown: "Contenido de userA.",
      })
      .select("id")
      .single();

    await supabase
      .from("user_games")
      .upsert({ user_id: users.userB.id, game_id: gameId }, { onConflict: "user_id,game_id" });

    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const page = await context.newPage();
    try {
      await page.goto(`/juegos/${gameId}/guias`);
      await expect(page.getByText("[E2E] Guía de userA")).toBeVisible();
      // userB puede crear su propia guía nueva (el <details> de arriba es de
      // cualquiera), pero no tiene ningún control sobre la de userA: ni
      // borrarla, ni el form de edición inline (que sí tendría un segundo
      // campo "Título" -- por eso no se puede comparar esa cuenta acá).
      await expect(page.getByRole("button", { name: "Borrar guía" })).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "[E2E] Guía de userA" }).locator("..").getByLabel("Título"),
      ).toHaveCount(0);

      const { data: stillThere } = await supabase
        .from("guides")
        .select("id")
        .eq("id", guide!.id)
        .maybeSingle();
      expect(stillThere).not.toBeNull();
    } finally {
      await context.close();
      await supabase.from("user_games").delete().eq("user_id", users.userB.id).eq("game_id", gameId);
    }
  });
});
