import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";

/**
 * Estudios de IGDB (epic #183, issue #193). Casos STUDIO-01..05 de
 * TESTING_PRD.md §6.25.
 *
 * Corren contra el mock de `lib/igdb/mocks.ts`: todo juego `[E2E]` lo
 * desarrolla "[E2E] Estudio" y lo publica "[E2E] Editora"; el estudio tiene
 * dos juegos (A y B, ids 901000001/2) que no están en `games`. A lo usa
 * STUDIO-05 (vinculado a un juego seedeado) y B lo materializa STUDIO-03, así
 * los dos tests no se pisan.
 */
const STUDIO_GAME_A = 901_000_001;

test.describe("Estudios", () => {
  test("STUDIO-01: la ficha muestra los estudios como links a su perfil", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Estudios Ficha ${users.runId}`,
      np: 2901,
    });

    await page.goto(`/juegos/${gameId}`);
    const studios = page.getByLabel("Estudios");
    await expect(studios.getByRole("link", { name: "[E2E] Estudio" })).toHaveAttribute(
      "href",
      "/estudios/e2e-estudio",
    );
    await expect(studios.getByRole("link", { name: "[E2E] Editora" })).toHaveAttribute(
      "href",
      "/estudios/e2e-editora",
    );
  });

  test("STUDIO-02: el perfil lista desarrollados y publicados", async ({ page }) => {
    await page.goto("/estudios/e2e-estudio");
    await expect(page.getByRole("heading", { level: 1, name: "[E2E] Estudio" })).toBeVisible();
    await expect(page.getByRole("link", { name: "[E2E] Editora" })).toHaveAttribute(
      "href",
      "/estudios/e2e-editora",
    );
    await expect(page.getByRole("link", { name: /\[E2E\] Juego del estudio A/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /\[E2E\] Juego del estudio B/ })).toBeVisible();

    // La editora no desarrolló nada: sus juegos están en la otra tab.
    await page.goto("/estudios/e2e-editora/publicados");
    await expect(page.getByRole("link", { name: /\[E2E\] Juego del estudio A/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /\[E2E\] Juego del estudio B/ })).toBeVisible();
  });

  test("STUDIO-03: tocar un juego que no está en la base lo materializa y abre su ficha", async ({
    page,
    supabase,
  }) => {
    await page.goto("/estudios/e2e-estudio");
    await page.getByRole("link", { name: /\[E2E\] Juego del estudio B/ }).click();

    await expect(page).toHaveURL(/\/juegos\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /\[E2E\] Juego del estudio B/ }),
    ).toBeVisible();

    const { data } = await supabase
      .from("games")
      .select("external_catalog_id, source")
      .eq("igdb_id", 901_000_002)
      .single();
    expect(data).toMatchObject({ external_catalog_id: "igdb:901000002", source: "catalog" });
  });

  test("STUDIO-04: si IGDB no se pudo consultar, los estudios no quedan como consultados", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `SIN-IGDB Estudios ${users.runId}`,
      np: 2904,
    });

    await page.goto(`/juegos/${gameId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("SIN-IGDB Estudios");
    await expect(page.getByLabel("Estudios")).toHaveCount(0);

    const { data } = await supabase
      .from("games")
      .select("companies_checked_at")
      .eq("id", gameId)
      .single();
    expect(data?.companies_checked_at).toBeNull();
  });

  test("STUDIO-05: el perfil dice cuántos jugaste y marca los jugados", async ({
    browser,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userB.id, {
      n: 1,
      nameSuffix: `Estudio A local ${users.runId}`,
      np: 2905,
    });
    // El juego seedeado es el "A" del estudio: se vincula por `igdb_id`, y con
    // `companies_checked_at` puesto la ficha no le vuelve a preguntar a IGDB.
    await supabase
      .from("games")
      .update({ igdb_id: STUDIO_GAME_A, companies_checked_at: new Date().toISOString() })
      .eq("id", gameId);
    await supabase.from("game_diary_entries").upsert(
      {
        user_id: users.userB.id,
        game_id: gameId,
        playthrough_number: 1,
        finished_on: "2026-05-01",
        rating: 8,
      },
      { onConflict: "user_id,game_id,playthrough_number" },
    );

    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const page = await context.newPage();
    await page.goto("/estudios/e2e-estudio");

    await expect(page.getByText(/Vos jugaste\s*1\s*de 2/)).toBeVisible();
    // El póster usa el nombre de IGDB, no el de la fila local.
    const played = page.getByRole("link", { name: /\[E2E\] Juego del estudio A/ });
    // Ya tiene fila en `games`: linkea a una ficha y no a la ruta que
    // materializa. No se fija el id exacto: el mismo juego de IGDB puede tener
    // más de una fila (PSN y Steam) y la ficha elegida es la más vieja.
    await expect(played).toHaveAttribute("href", /^\/juegos\/[0-9a-f-]{36}$/);
    await expect(played.getByRole("img", { name: "Jugado" })).toBeVisible();
    await context.close();
  });
});
