import type { SupabaseClient } from "@supabase/supabase-js";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import { createTestUserClient } from "../helpers/supabase";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/auth";

/**
 * Listas (epic #183, issues #189 y #192). Casos LIST-01..06 y LIST-10..14 de
 * TESTING_PRD.md §6.23.
 *
 * En serie: todos escriben listas de userA. Cada test borra antes las listas
 * con su título (un reintento no se encuentra con la de la corrida anterior);
 * al final de la suite, las listas se van en cascada con los usuarios de test.
 */
test.describe.configure({ mode: "serial" });

const LIST_PREFIX = "[E2E] Lista";

/** Los títulos llevan `[E2E]`, que en una regex es una clase de caracteres. */
function literal(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

async function seedGames(
  supabase: SupabaseClient,
  userId: string,
  games: { suffix: string; np: number; n?: number }[],
) {
  const seeded = [];
  for (const game of games) {
    seeded.push(
      await seedGameWithTrophies(supabase, userId, {
        n: game.n ?? 1,
        nameSuffix: game.suffix,
        np: game.np,
      }),
    );
  }
  return seeded;
}

/** Crea una lista de userA directo en la base, borrando antes cualquiera con el mismo título. */
async function seedList(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    title: string;
    gameIds: string[];
    visibility?: "public" | "private";
    isRanked?: boolean;
  },
): Promise<string> {
  await supabase.from("user_lists").delete().eq("user_id", userId).eq("title", opts.title);
  const { data: list, error } = await supabase
    .from("user_lists")
    .insert({
      user_id: userId,
      title: opts.title,
      visibility: opts.visibility ?? "public",
      is_ranked: opts.isRanked ?? false,
    })
    .select("id")
    .single();
  if (error || !list) throw new Error(`No se pudo seedear la lista: ${error?.message}`);
  if (opts.gameIds.length > 0) {
    await supabase.from("user_list_items").insert(
      opts.gameIds.map((gameId, index) => ({
        list_id: list.id,
        game_id: gameId,
        position: index + 1,
      })),
    );
  }
  return list.id;
}

async function listItems(supabase: SupabaseClient, listId: string) {
  const { data } = await supabase
    .from("user_list_items")
    .select("game_id, position, note")
    .eq("list_id", listId)
    .order("position");
  return data ?? [];
}

test.describe("Listas", () => {
  test("LIST-01: crear una lista con 3 juegos la muestra en su ficha y en Perfil › Listas", async ({
    page,
    supabase,
    users,
  }) => {
    const title = `${LIST_PREFIX} Creada`;
    await supabase.from("user_lists").delete().eq("user_id", users.userA.id).eq("title", title);
    const names = ["Lista Alfa", "Lista Beta", "Lista Gamma"];
    await seedGames(
      supabase,
      users.userA.id,
      names.map((suffix, index) => ({ suffix, np: 2601 + index })),
    );

    await page.goto("/listas/nueva");
    await page.getByLabel("Título").fill(title);

    const adder = page.getByRole("region", { name: "Agregar juegos" });
    const games = page.getByRole("list", { name: "Juegos de la lista" });
    for (const name of names) {
      await adder.getByLabel("Buscar juego").fill(testGameTitle(name));
      // El botón de la fila de ESE juego: mientras corre la búsqueda nueva
      // siguen a la vista los resultados de la anterior.
      await adder
        .getByRole("listitem")
        .filter({ hasText: testGameTitle(name) })
        .getByRole("button", { name: "Agregar" })
        .click();
      await expect(games.getByText(testGameTitle(name))).toBeVisible();
    }

    await page.getByRole("button", { name: "Guardar lista" }).click();
    await expect(page).toHaveURL(/\/listas\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    for (const name of names) {
      await expect(page.getByRole("link", { name: testGameTitle(name) })).toBeVisible();
    }

    await page.goto("/perfil/listas");
    await expect(
      page
        .getByRole("list", { name: "Mis listas" })
        .getByTestId("profile-list")
        .filter({ hasText: title }),
    ).toHaveCount(1);
  });

  test("LIST-02: reordenar y editar la nota de un juego", async ({ page, supabase, users }) => {
    const [alfa, beta, gamma] = await seedGames(supabase, users.userA.id, [
      { suffix: "Lista Alfa", np: 2601 },
      { suffix: "Lista Beta", np: 2602 },
      { suffix: "Lista Gamma", np: 2603 },
    ]);
    const listId = await seedList(supabase, users.userA.id, {
      title: `${LIST_PREFIX} Ordenada`,
      isRanked: true,
      gameIds: [alfa.gameId, beta.gameId, gamma.gameId],
    });

    await page.goto(`/listas/${listId}/editar`);
    await page.getByRole("button", { name: `Bajar ${testGameTitle("Lista Alfa")}` }).click();
    await page
      .getByLabel(`Nota para ${testGameTitle("Lista Beta")}`)
      .fill("[E2E] La mejor de la saga");
    await page.getByRole("button", { name: "Guardar lista" }).click();
    await expect(page).toHaveURL(new RegExp(`/listas/${listId}$`));

    expect(
      (await listItems(supabase, listId)).map(({ game_id, position, note }) => ({
        game_id,
        position,
        note,
      })),
    ).toEqual([
      { game_id: beta.gameId, position: 1, note: "[E2E] La mejor de la saga" },
      { game_id: alfa.gameId, position: 2, note: null },
      { game_id: gamma.gameId, position: 3, note: null },
    ]);

    await page.goto(`/listas/${listId}?vista=detalle`);
    await expect(page.getByText("[E2E] La mejor de la saga")).toBeVisible();
  });

  test("LIST-03: agregar a una lista desde la ficha del juego", async ({
    page,
    supabase,
    users,
  }) => {
    const title = `${LIST_PREFIX} Desde Ficha`;
    const [other, target] = await seedGames(supabase, users.userA.id, [
      { suffix: "Lista Alfa", np: 2601 },
      { suffix: "Lista Ficha", np: 2631 },
    ]);
    const listId = await seedList(supabase, users.userA.id, {
      title,
      gameIds: [other.gameId],
    });

    await page.goto(`/juegos/${target.gameId}`);
    const panel = page.getByRole("region", { name: "Acciones" });
    await expect(panel.getByRole("button", { name: "Lista" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await panel.getByRole("button", { name: "Lista" }).click();

    const dialog = page.getByRole("dialog", { name: "Agregar a una lista" });
    const row = dialog.getByRole("button", { name: literal(title) });
    await expect(row).toHaveAttribute("aria-pressed", "false");
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");

    // El tilde es optimista: la escritura puede llegar un instante después.
    await expect
      .poll(async () => (await listItems(supabase, listId)).map((item) => item.game_id))
      .toEqual([other.gameId, target.gameId]);
  });

  test("LIST-04: una lista privada no la ve otro usuario", async ({ browser, supabase, users }) => {
    const [game] = await seedGames(supabase, users.userA.id, [{ suffix: "Lista Alfa", np: 2601 }]);
    const listId = await seedList(supabase, users.userA.id, {
      title: `${LIST_PREFIX} Privada`,
      visibility: "private",
      gameIds: [game.gameId],
    });

    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const page = await context.newPage();
    try {
      const response = await page.goto(`/listas/${listId}`);
      expect(response?.status()).toBe(404);
    } finally {
      await context.close();
    }

    const asB = await createTestUserClient(users.userB.email, users.userB.password);
    const { data: lists } = await asB.from("user_lists").select("id").eq("id", listId);
    expect(lists).toEqual([]);
    const { data: items } = await asB
      .from("user_list_items")
      .select("game_id")
      .eq("list_id", listId);
    expect(items).toEqual([]);
  });

  test("LIST-05: otro usuario no puede editar tu lista", async ({ browser, supabase, users }) => {
    const title = `${LIST_PREFIX} Ajena`;
    const [game] = await seedGames(supabase, users.userA.id, [{ suffix: "Lista Alfa", np: 2601 }]);
    const listId = await seedList(supabase, users.userA.id, { title, gameIds: [] });

    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const page = await context.newPage();
    try {
      // Pública: la ficha se ve, pero no hay "Editar lista" y la edición es 404.
      await page.goto(`/listas/${listId}`);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("link", { name: "Editar lista" })).toHaveCount(0);
      const response = await page.goto(`/listas/${listId}/editar`);
      expect(response?.status()).toBe(404);
    } finally {
      await context.close();
    }

    const asB = await createTestUserClient(users.userB.email, users.userB.password);
    await asB.from("user_lists").update({ title: "[E2E] Hackeada" }).eq("id", listId);
    const { error: insertError } = await asB
      .from("user_list_items")
      .insert({ list_id: listId, game_id: game.gameId, position: 1 });
    expect(insertError).not.toBeNull();

    const { data: stored } = await supabase
      .from("user_lists")
      .select("title")
      .eq("id", listId)
      .single();
    expect(stored?.title).toBe(title);
    expect(await listItems(supabase, listId)).toEqual([]);
  });

  test("LIST-06: la ficha dice cuántos juegos de la lista jugaste", async ({
    page,
    supabase,
    users,
  }) => {
    // Platinado (n=4: el cuarto trofeo del seed es el platino), con reseña en
    // el diario, y sin jugar.
    const [platinumed, reviewed, unplayed] = await seedGames(supabase, users.userA.id, [
      { suffix: "Lista Platino", np: 2661, n: 4 },
      { suffix: "Lista Diario", np: 2662 },
      { suffix: "Lista Pendiente", np: 2663 },
    ]);
    await supabase.from("user_trophies").upsert(
      {
        user_id: users.userA.id,
        trophy_id: platinumed.trophyIds[3],
        unlocked_at: "2026-05-01T12:00:00Z",
      },
      { onConflict: "user_id,trophy_id" },
    );
    await supabase.from("game_diary_entries").upsert(
      {
        user_id: users.userA.id,
        game_id: reviewed.gameId,
        playthrough_number: 1,
        finished_on: "2026-05-04",
      },
      { onConflict: "user_id,game_id,playthrough_number" },
    );
    const listId = await seedList(supabase, users.userA.id, {
      title: `${LIST_PREFIX} Progreso`,
      gameIds: [platinumed.gameId, reviewed.gameId, unplayed.gameId],
    });

    await page.goto(`/listas/${listId}`);
    await expect(page.getByRole("region", { name: "Tu progreso en la lista" })).toHaveText(
      /Vos jugaste 2 de 3/,
    );
  });
});

/**
 * Pide el refresco de las listas pregeneradas al cron, sólo ese paso
 * (`?paso=listas`): el cron completo sincronizaría todas las cuentas reales.
 */
async function refreshSystemLists(request: APIRequestContext) {
  const response = await request.get("/api/cron/sync?paso=listas", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.systemLists.ok).toBe(true);
}

/**
 * Seedea juegos con año de lanzamiento y los puntúa con 10 los usuarios
 * dados, así el promedio queda arriba de todo y la lista del año es
 * determinista. Los años son de 1970 y pico: no hay juegos reales puntuados.
 */
async function seedRatedGames(
  supabase: SupabaseClient,
  ownerId: string,
  games: { suffix: string; np: number }[],
  year: number,
  raters: string[][],
) {
  const seeded = await seedGames(supabase, ownerId, games);
  for (const [index, game] of seeded.entries()) {
    await supabase.from("games").update({ release_year: year }).eq("id", game.gameId);
    await supabase.from("game_diary_entries").upsert(
      raters[index].map((userId) => ({
        user_id: userId,
        game_id: game.gameId,
        playthrough_number: 1,
        finished_on: "2026-05-01",
        rating: 10,
      })),
      { onConflict: "user_id,game_id,playthrough_number" },
    );
  }
  return seeded;
}

test.describe("Listas pregeneradas", () => {
  /**
   * Un tercer usuario que puntúa: userC no sirve, porque `28-library-home`
   * borra todo su diario desde el otro worker. El sufijo lleva la hora para
   * que un reintento no choque con el mail del intento anterior.
   */
  let rater: TestUser;

  test.beforeAll(async ({ supabase }) => {
    rater = await createTestUser(supabase, `list-rater-${Date.now()}`);
  });

  test.afterAll(async ({ supabase }) => {
    if (rater) await deleteTestUser(supabase, rater.id);
  });

  test("LIST-10: la tab muestra primero las listas de amigos", async ({
    page,
    supabase,
    users,
  }) => {
    const title = "[E2E] Lista De Un Amigo";
    // La misma amistad que deja `28-library-home`: upsert, no se pisa nada.
    await supabase
      .from("friendships")
      .upsert(
        { user_id: users.userA.id, friend_id: users.userC.id },
        { onConflict: "user_id,friend_id" },
      );
    const [game] = await seedGames(supabase, users.userC.id, [{ suffix: "Lista Amigo", np: 2671 }]);
    const listId = await seedList(supabase, users.userC.id, { title, gameIds: [game.gameId] });

    try {
      await page.goto("/biblioteca/listas");
      const friends = page.getByRole("region", { name: "Nuevas de tus amigos" });
      const system = page.getByRole("region", { name: "Armadas por Platinoob" });
      await expect(friends.getByRole("link", { name: literal(title) })).toBeVisible();
      await expect(system).toBeVisible();

      const friendsBox = await friends.boundingBox();
      const systemBox = await system.boundingBox();
      expect(friendsBox!.y).toBeLessThan(systemBox!.y);

      await friends.getByRole("link", { name: literal(title) }).click();
      await expect(page).toHaveURL(new RegExp(`/listas/${listId}$`));
    } finally {
      await supabase.from("user_lists").delete().eq("id", listId);
    }
  });

  test("LIST-11: 'Mejor puntuados' respeta el mínimo de valoraciones", async ({
    page,
    request,
    supabase,
    users,
  }) => {
    test.skip(!process.env.CRON_SECRET, "Necesita CRON_SECRET para llamar al cron.");
    const three = [users.userA.id, users.userB.id, rater.id];
    const names = ["Top Uno", "Top Dos", "Top Tres", "Top Cuatro", "Top Cinco"];
    const rated = await seedRatedGames(
      supabase,
      users.userA.id,
      [...names, "Top Dos Votos"].map((suffix, index) => ({ suffix, np: 2672 + index })),
      1972,
      // Los cinco primeros con 3 valoraciones; el último, con 2: un 10 de
      // promedio que no alcanza el mínimo.
      [three, three, three, three, three, [users.userA.id, users.userB.id]],
    );
    const underMinimum = rated[5].gameId;

    await refreshSystemLists(request);

    const { data: best } = await supabase
      .from("system_list_items")
      .select("game_id")
      .eq("list_slug", "mejor-puntuados");
    const bestIds = (best ?? []).map((row) => row.game_id);
    for (const game of rated.slice(0, 5)) expect(bestIds).toContain(game.gameId);
    expect(bestIds).not.toContain(underMinimum);

    await page.goto("/listas/sistema/mejor-de-1972");
    await expect(page.getByRole("heading", { level: 1, name: "Lo mejor de 1972" })).toBeVisible();
    for (const name of names) {
      await expect(page.getByRole("link", { name: testGameTitle(name) })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: testGameTitle("Top Dos Votos") })).toHaveCount(0);
  });

  test("LIST-12: una pregenerada con menos de 5 juegos no aparece", async ({
    page,
    request,
    supabase,
    users,
  }) => {
    test.skip(!process.env.CRON_SECRET, "Necesita CRON_SECRET para llamar al cron.");
    const three = [users.userA.id, users.userB.id, rater.id];
    await seedRatedGames(
      supabase,
      users.userA.id,
      ["Corta Uno", "Corta Dos", "Corta Tres", "Corta Cuatro"].map((suffix, index) => ({
        suffix,
        np: 2678 + index,
      })),
      1971,
      [three, three, three, three],
    );

    await refreshSystemLists(request);

    const { data: stored } = await supabase
      .from("system_lists")
      .select("slug")
      .eq("slug", "mejor-de-1971");
    expect(stored).toEqual([]);

    const response = await page.goto("/listas/sistema/mejor-de-1971");
    expect(response?.status()).toBe(404);
    await page.goto("/biblioteca/listas");
    await expect(page.getByRole("region", { name: "Armadas por Platinoob" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Lo mejor de 1971/ })).toHaveCount(0);
  });

  test("LIST-13: el paso del cron refresca system_lists", async ({
    page,
    request,
    supabase,
    users,
  }) => {
    test.skip(!process.env.CRON_SECRET, "Necesita CRON_SECRET para llamar al cron.");
    const unauthorized = await request.get("/api/cron/sync?paso=listas");
    expect(unauthorized.status()).toBe(401);

    const three = [users.userA.id, users.userB.id, rater.id];
    const rated = await seedRatedGames(
      supabase,
      users.userA.id,
      ["Cron Uno", "Cron Dos", "Cron Tres", "Cron Cuatro", "Cron Cinco"].map((suffix, index) => ({
        suffix,
        np: 2682 + index,
      })),
      1973,
      [three, three, three, three, three],
    );
    const before = Date.now();

    await refreshSystemLists(request);

    const { data: list } = await supabase
      .from("system_lists")
      .select("item_count, refreshed_at")
      .eq("slug", "mejor-de-1973")
      .single();
    expect(list?.item_count).toBe(5);
    // Un margen por si el reloj del runner y el de la base no coinciden.
    expect(new Date(list!.refreshed_at).getTime()).toBeGreaterThan(before - 60_000);

    const { data: items } = await supabase
      .from("system_list_items")
      .select("game_id")
      .eq("list_slug", "mejor-de-1973");
    expect((items ?? []).map((row) => row.game_id).sort()).toEqual(
      rated.map((game) => game.gameId).sort(),
    );

    await page.goto("/biblioteca/listas");
    await expect(
      page
        .getByRole("region", { name: "Armadas por Platinoob" })
        .getByRole("link", { name: /Lo mejor de 1973/ }),
    ).toBeVisible();
  });

  test("LIST-14: 'Populares entre tus amigos' cambia según a quién sigue el usuario", async ({
    browser,
    page,
    supabase,
    users,
  }) => {
    // userB sigue a userA, y userA terminó cinco juegos. userA no se sigue a
    // sí mismo: para él esos juegos no son "de sus amigos".
    const names = ["Amigos Uno", "Amigos Dos", "Amigos Tres", "Amigos Cuatro", "Amigos Cinco"];
    const games = await seedGames(
      supabase,
      users.userA.id,
      names.map((suffix, index) => ({ suffix, np: 2687 + index })),
    );
    await supabase.from("game_diary_entries").upsert(
      games.map((game) => ({
        user_id: users.userA.id,
        game_id: game.gameId,
        playthrough_number: 1,
        finished_on: "2026-05-02",
      })),
      { onConflict: "user_id,game_id,playthrough_number" },
    );
    await supabase
      .from("friendships")
      .upsert(
        { user_id: users.userB.id, friend_id: users.userA.id },
        { onConflict: "user_id,friend_id" },
      );

    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const asB = await context.newPage();
    try {
      await asB.goto("/listas/sistema/populares-entre-amigos");
      for (const name of names) {
        await expect(asB.getByRole("link", { name: testGameTitle(name) })).toBeVisible();
      }

      await page.goto("/listas/sistema/populares-entre-amigos");
      await expect(page.getByRole("link", { name: testGameTitle(names[0]) })).toHaveCount(0);

      // Deja de seguirlo: la lista ya no tiene esos juegos (ni existe, sin amigos).
      await supabase
        .from("friendships")
        .delete()
        .eq("user_id", users.userB.id)
        .eq("friend_id", users.userA.id);
      await asB.goto("/listas/sistema/populares-entre-amigos");
      await expect(asB.getByRole("link", { name: testGameTitle(names[0]) })).toHaveCount(0);
    } finally {
      await context.close();
      await supabase
        .from("friendships")
        .delete()
        .eq("user_id", users.userB.id)
        .eq("friend_id", users.userA.id);
      await supabase
        .from("game_diary_entries")
        .delete()
        .eq("user_id", users.userA.id)
        .in(
          "game_id",
          games.map((game) => game.gameId),
        );
    }
  });
});
