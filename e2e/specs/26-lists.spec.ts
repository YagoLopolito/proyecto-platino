import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import { createTestUserClient } from "../helpers/supabase";

/**
 * Listas (epic #183, issue #189). Casos LIST-01..06 de TESTING_PRD.md §6.23.
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
      page.getByRole("list", { name: "Tus listas" }).getByRole("link", { name: literal(title) }),
    ).toBeVisible();
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

    const items = await listItems(supabase, listId);
    expect(items.map((item) => item.game_id)).toEqual([other.gameId, target.gameId]);
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
