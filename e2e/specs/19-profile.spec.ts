import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";

/**
 * Perfil: Top 5 elegido por el usuario y perfil público de otro usuario
 * (`app/(app)/perfil/page.tsx`, `app/(app)/perfil/[id]/page.tsx`). Casos
 * PROF-06..PROF-10 de TESTING_PRD.md §6.10.
 *
 * No hay nada mockeado acá: el Top 5 y el diario son datos propios de la app
 * (`user_favorite_games`, `game_diary_entries`), no salen de ninguna API
 * externa. Lo que se seedea con service role son los juegos y las entradas de
 * diario, igual que el resto de la suite.
 *
 * `serial`: los tests comparten el Top 5 de userA, que es una sola fila por
 * casillero — con `fullyParallel` se pisarían entre sí.
 */
test.describe.serial("Perfil", () => {
  test("PROF-06: el perfil ya no muestra 'Últimos jugados'", async ({ page }) => {
    await page.goto("/perfil");

    await expect(page.getByRole("heading", { name: "Top 5" })).toBeVisible();
    await expect(page.getByText("Últimos jugados")).toHaveCount(0);
  });

  test("PROF-07: elegir un Top 5 lo muestra en el perfil y lo guarda", async ({
    page,
    supabase,
    users,
  }) => {
    const game = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Top Five",
      np: 901,
    });
    // Sin horas jugadas ni logros un juego de Steam no entra a la biblioteca,
    // pero este es `source = 'psn'`: entra siempre (ver isVisibleInLibrary).
    await supabase.from("user_favorite_games").delete().eq("user_id", users.userA.id);

    await page.goto("/perfil");
    await page.getByRole("button", { name: "Elegir" }).click();

    const modal = page.getByRole("dialog");
    await modal.getByLabel("Buscar en tu biblioteca").fill("Top Five");
    await modal.getByTestId("favorite-candidate").first().click();
    await expect(modal.getByText("1 de 5 elegidos")).toBeVisible();
    await modal.getByRole("button", { name: "Guardar Top 5" }).click();

    // El estado final: la carátula queda en la sección del perfil.
    await expect(page.getByTestId("favorite-game")).toHaveCount(1);
    await expect(page.getByTestId("favorite-game").getByText("#1")).toBeVisible();

    const { data: rows } = await supabase
      .from("user_favorite_games")
      .select("game_id, slot")
      .eq("user_id", users.userA.id);
    expect(rows).toEqual([{ game_id: game.gameId, slot: 1 }]);
  });

  test("PROF-08: el perfil muestra las últimas entradas del diario con su reseña", async ({
    page,
    supabase,
    users,
  }) => {
    const game = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Perfil Diario",
      np: 902,
    });
    await supabase.from("game_diary_entries").upsert(
      {
        user_id: users.userA.id,
        game_id: game.gameId,
        playthrough_number: 1,
        rating: 8,
        review: "[E2E] Reseña de prueba del perfil",
        finished_on: "2026-05-04",
      },
      { onConflict: "user_id,game_id,playthrough_number" },
    );

    await page.goto("/perfil");

    const entries = page.getByTestId("profile-diary-entry");
    await expect(entries.filter({ hasText: "[E2E] Reseña de prueba del perfil" })).toHaveCount(1);
  });

  test("PROF-09: el perfil de otro usuario muestra su Top 5 y sus reseñas", async ({
    page,
    supabase,
    users,
  }) => {
    const game = await seedGameWithTrophies(supabase, users.userB.id, {
      n: 1,
      nameSuffix: "Perfil Ajeno",
      np: 903,
    });
    await supabase
      .from("user_favorite_games")
      .upsert(
        { user_id: users.userB.id, game_id: game.gameId, slot: 1 },
        { onConflict: "user_id,game_id" },
      );
    await supabase.from("game_diary_entries").upsert(
      {
        user_id: users.userB.id,
        game_id: game.gameId,
        playthrough_number: 1,
        rating: 6,
        review: "[E2E] Reseña de otro usuario",
        finished_on: "2026-05-05",
      },
      { onConflict: "user_id,game_id,playthrough_number" },
    );

    await page.goto(`/perfil/${users.userB.id}`);

    await expect(page.getByTestId("favorite-game")).toHaveCount(1);
    await expect(
      page.getByTestId("profile-diary-entry").filter({ hasText: "[E2E] Reseña de otro usuario" }),
    ).toHaveCount(1);
    // Es un perfil ajeno: se puede agregar a amigos, no editar el Top 5.
    await expect(
      page.getByRole("button", { name: /Agregar a amigos|Quitar de amigos/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
  });

  test("PROF-11: el buscador del Top 5 no saca el foco del campo al tipear", async ({ page }) => {
    await page.goto("/perfil");
    await page.getByRole("button", { name: /Elegir|Editar/ }).click();

    const modal = page.getByRole("dialog");
    const search = modal.getByLabel("Buscar en tu biblioteca");
    await search.click();
    await search.pressSequentially("Top Five", { delay: 50 });

    // El modal reenfocaba la ✕ en cada render (su effect dependía de un
    // `onClose` inline que cambia de identidad en cada tecla), lo que en mobile
    // cerraba el teclado a mitad de palabra.
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("Top Five");
  });

  test("PROF-12: se puede sumar al Top 5 un juego que no está en la biblioteca", async ({
    page,
    supabase,
    users,
  }) => {
    // Un juego que existe en `games` pero que este usuario no tiene vinculado:
    // es el caso de los juegos de PC o de consolas que la app no sincroniza.
    const game = await seedGameWithTrophies(supabase, users.userB.id, {
      n: 1,
      nameSuffix: "Fuera De Biblioteca",
      np: 904,
    });
    await supabase
      .from("user_games")
      .delete()
      .eq("user_id", users.userA.id)
      .eq("game_id", game.gameId);
    await supabase.from("user_favorite_games").delete().eq("user_id", users.userA.id);

    await page.goto("/perfil");
    await page.getByRole("button", { name: /Elegir|Editar/ }).click();

    const modal = page.getByRole("dialog");
    await modal.getByLabel("Buscar en tu biblioteca").fill("Fuera De Biblioteca");
    await modal.getByTestId("favorite-catalog-result").first().click();

    await expect(modal.getByText("1 de 5 elegidos")).toBeVisible();
    await modal.getByRole("button", { name: "Guardar Top 5" }).click();

    await expect(page.getByTestId("favorite-game")).toHaveCount(1);
    const { data: rows } = await supabase
      .from("user_favorite_games")
      .select("game_id, slot")
      .eq("user_id", users.userA.id);
    expect(rows).toEqual([{ game_id: game.gameId, slot: 1 }]);
    // Quedó vinculado en la biblioteca del usuario: sin eso la Server Action
    // habría rechazado el guardado.
    const { data: link } = await supabase
      .from("user_games")
      .select("game_id")
      .eq("user_id", users.userA.id)
      .eq("game_id", game.gameId);
    expect(link).toHaveLength(1);
  });

  test("PROF-10: el propio id redirige al perfil propio", async ({ page, users }) => {
    await page.goto(`/perfil/${users.userA.id}`);

    await expect(page).toHaveURL(/\/perfil$/);
    // La pantalla propia es la que tiene el email y el editor del Top 5.
    await expect(page.getByRole("button", { name: /Elegir|Editar/ })).toBeVisible();
  });
});
