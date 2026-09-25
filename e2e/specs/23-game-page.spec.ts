import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import { SYNOPSIS_MAX_CHARS, toSynopsis } from "@/lib/catalog/synopsis";

/**
 * Ficha de juego unificada con tabs (epic #183, issue #186). Casos
 * FICHA-01..FICHA-07 de TESTING_PRD.md §6.20.
 *
 * Los IDs son `FICHA-` y no los `GAME-0x` que proponía el issue: esos ya
 * existen en §6.4 (`04-game-detail.spec.ts`) y significan otra cosa.
 */
test.describe("Ficha de juego unificada", () => {
  test("FICHA-01: un juego que no está en tu biblioteca abre su ficha, sin trofeos tuyos", async ({
    browser,
    supabase,
    users,
  }) => {
    // El juego es de userA; userB nunca lo tuvo. Antes de #186 la ficha exigía
    // `user_games` y esto era un 404.
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 3,
      nameSuffix: "Ficha Ajena",
      np: 2301,
    });

    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const page = await context.newPage();
    try {
      await page.goto(`/juegos/${gameId}`);
      await expect(page.getByRole("heading", { name: testGameTitle("Ficha Ajena") })).toBeVisible();
      // Trofeos es la tab default: existe, pero sin datos (`user_trophies` es
      // privado y el juego no está en la biblioteca de quien mira).
      await expect(page.getByRole("tab", { name: "Trofeos" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByText(/no está en tu biblioteca/)).toBeVisible();
      await expect(page.getByText("Ficha Ajena - Trofeo 1")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("FICHA-02: las fichas viejas de diario y de enlaces redirigen a su tab", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Ficha Redirects",
      np: 2302,
    });

    await page.goto(`/juegos/${gameId}/diario`);
    await expect(page).toHaveURL(new RegExp(`/juegos/${gameId}/resenas$`));
    await expect(page.getByRole("tab", { name: "Reseñas" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // `/trofeos` era la tab antes de que Trofeos pasara a ser la default.
    await page.goto(`/juegos/${gameId}/trofeos`);
    await expect(page).toHaveURL(new RegExp(`/juegos/${gameId}$`));
    await expect(page.getByRole("tab", { name: "Trofeos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.goto(`/juegos/${gameId}/enlaces`);
    await expect(page).toHaveURL(new RegExp(`/juegos/${gameId}/guias$`));
    await expect(page.getByRole("tab", { name: "Guías e IA" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("FICHA-03: las tabs de la ficha viven en la URL y se recorren con el teclado", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Ficha Tabs",
      np: 2303,
    });

    await page.goto(`/juegos/${gameId}`);
    const tablist = page.getByRole("tablist", { name: "Ficha del juego" });
    // Trofeos es la default.
    await expect(page.getByText("Ficha Tabs - Trofeo 1")).toBeVisible();
    await tablist.getByRole("tab", { name: "Trofeos" }).focus();

    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`/juegos/${gameId}/resenas$`));

    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`/juegos/${gameId}/guias$`));
    await expect(page.getByText(/Contenido generado por IA/i)).toBeVisible();

    // Recargar deja la misma tab: el estado es la URL, no React.
    await page.reload();
    await expect(tablist.getByRole("tab", { name: "Guías e IA" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("FICHA-04: abrir un juego del catálogo dos veces crea una sola fila", async ({
    page,
    supabase,
    users,
  }) => {
    // `E2E-` es el prefijo que el mock de RAWG reconoce (`fetchGameDetails`) y
    // el que limpia el teardown.
    const externalId = `E2E-CAT-${users.runId}`;

    await page.goto(`/juegos/catalogo/${externalId}`);
    await expect(page).toHaveURL(/\/juegos\/[0-9a-f-]{36}$/);
    const firstUrl = page.url();
    await expect(page.getByRole("heading", { name: `[E2E] Catálogo ${externalId}` })).toBeVisible();

    await page.goto(`/juegos/catalogo/${externalId}`);
    await expect(page).toHaveURL(firstUrl);

    const { data } = await supabase
      .from("games")
      .select("id, source")
      .eq("external_catalog_id", externalId);
    expect(data).toHaveLength(1);
    expect(data?.[0].source).toBe("catalog");

    // Abrir la ficha no es agregar el juego a tu biblioteca.
    const { count } = await supabase
      .from("user_games")
      .select("game_id", { count: "exact", head: true })
      .eq("user_id", users.userA.id)
      .eq("game_id", data![0].id);
    expect(count).toBe(0);
  });

  test("FICHA-05: registrar una partida desde el panel de acciones la guarda y agrega el juego a tu biblioteca", async ({
    page,
    supabase,
    users,
  }) => {
    const externalId = `E2E-CAT-REG-${users.runId}`;
    await page.goto(`/juegos/catalogo/${externalId}`);
    await expect(page).toHaveURL(/\/juegos\/[0-9a-f-]{36}$/);
    const gameId = page.url().split("/").pop()!;

    const panel = page.getByRole("region", { name: "Acciones" });
    // Jugando (#187), Playlist (#188) y Lista (#189) arrancan sin marcar en un
    // juego recién materializado; cada uno tiene su propio caso (PLAY-02,
    // PLIST-01, LIST-03).
    for (const name of ["Jugando", "Playlist", "Lista"]) {
      await expect(panel.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }

    await panel.getByRole("button", { name: "Registrar o puntuar" }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar o puntuar" });
    await dialog.getByLabel("Reseña (opcional)").fill("[E2E] Reseña desde la ficha");
    await dialog.getByRole("button", { name: "Guardar en el diario" }).click();
    await expect(dialog.getByText("Entrada guardada en el diario.")).toBeVisible();

    const { data: entries } = await supabase
      .from("game_diary_entries")
      .select("review")
      .eq("user_id", users.userA.id)
      .eq("game_id", gameId);
    expect(entries?.map((entry) => entry.review)).toEqual(["[E2E] Reseña desde la ficha"]);

    const { count } = await supabase
      .from("user_games")
      .select("game_id", { count: "exact", head: true })
      .eq("user_id", users.userA.id)
      .eq("game_id", gameId);
    expect(count).toBe(1);
  });

  test("FICHA-06: la carátula se abre a pantalla completa y se cierra con Escape", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Ficha Pantalla Completa",
      np: 2306,
    });
    await supabase.from("games").update({ cover_url: "/logo.webp" }).eq("id", gameId);

    await page.goto(`/juegos/${gameId}`);
    const title = testGameTitle("Ficha Pantalla Completa");
    await page
      .getByRole("button", { name: `Ver la carátula de ${title} en pantalla completa` })
      .click();
    const viewer = page.getByRole("dialog", { name: title });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("img", { name: title })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
  });

  test("FICHA-07: la descripción es una sinopsis corta, no el texto entero", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Ficha Sinopsis",
      np: 2307,
    });
    const first = "Primera oración de la sinopsis. Segunda oración corta.";
    const rest = "Segundo párrafo con detalles de mecánicas que no van en la ficha.";
    await supabase
      .from("games")
      .update({ description: `${first}\n\n${rest}`, description_source: "rawg" })
      .eq("id", gameId);

    await page.goto(`/juegos/${gameId}`);
    await expect(page.getByText(first)).toBeVisible();
    await expect(page.getByText(rest)).toHaveCount(0);

    // La regla, pura: primer párrafo y cortado en una oración completa.
    const long = `${"Una oración bastante larga que describe el juego. ".repeat(10)}`;
    const synopsis = toSynopsis(long)!;
    expect(synopsis.length).toBeLessThanOrEqual(SYNOPSIS_MAX_CHARS);
    expect(synopsis.endsWith(".")).toBe(true);
    expect(toSynopsis("   ")).toBeNull();
  });
});
