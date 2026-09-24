import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";

/**
 * Búsqueda con búsquedas recientes (epic #183, issue #194). Casos
 * SEARCH-01..07 de TESTING_PRD.md §6.26.
 *
 * En serie: todos leen o escriben las `recent_searches` de userA, y cada test
 * que las mira arranca borrándolas. Los estudios salen del mock de
 * `lib/igdb/mocks.ts`; RAWG no tiene key en CI, así que los juegos salen de
 * `games` (los seedeados acá).
 */
test.describe.configure({ mode: "serial" });

async function clearRecents(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from("recent_searches").delete().eq("user_id", userId);
  if (error) throw new Error(`No se pudieron limpiar las recientes: ${error.message}`);
}

async function countRecents(supabase: SupabaseClient, userId: string, query?: string) {
  let request = supabase
    .from("recent_searches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (query) request = request.ilike("query", query);
  const { count } = await request;
  return count ?? 0;
}

/** Los títulos llevan `[E2E]`, que en una regex es una clase de caracteres. */
function literal(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

test.describe("Buscar", () => {
  test("SEARCH-01: buscar un juego y abrir su ficha", async ({ page, supabase, users }) => {
    const suffix = `Buscable ${users.runId}`;
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: suffix,
      np: 3001,
    });

    await page.goto("/buscar");
    await page.getByRole("searchbox", { name: "Buscar", exact: true }).fill(testGameTitle(suffix));
    // Con debounce la query llega sola a la URL, sin Enter.
    await expect(page).toHaveURL(/\/buscar\?q=/);
    await page
      .getByRole("list", { name: "Juegos" })
      .getByRole("link", { name: literal(testGameTitle(suffix)) })
      .click();

    await expect(page).toHaveURL(new RegExp(`/juegos/${gameId}$`));
  });

  test("SEARCH-02: la búsqueda queda en recientes con su ámbito; repetirla no la duplica", async ({
    page,
    supabase,
    users,
  }) => {
    await clearRecents(supabase, users.userA.id);
    const query = `[E2E] Estudio`;

    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto("/buscar?en=estudios");
      const field = page.getByRole("searchbox", { name: "Buscar", exact: true });
      await field.fill(query);
      await field.press("Enter");
      await expect(page).toHaveURL(/\/buscar\?q=.*en=estudios/);
    }

    expect(await countRecents(supabase, users.userA.id)).toBe(1);

    await page.goto("/buscar");
    const recents = page.getByRole("region", { name: "Búsquedas recientes" });
    const row = recents.getByRole("link", { name: literal(query) });
    await expect(row).toContainText("Estudios");

    // Tocarla la repite en su ámbito.
    await row.click();
    await expect(page).toHaveURL(/\/buscar\?q=.*en=estudios/);
    await expect(page.getByRole("tab", { name: "Estudios" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("SEARCH-03: borrar una reciente y Borrar todo", async ({ page, supabase, users }) => {
    await clearRecents(supabase, users.userA.id);
    await supabase.from("recent_searches").insert([
      { user_id: users.userA.id, query: "E2E uno", scope: "juegos" },
      { user_id: users.userA.id, query: "E2E dos", scope: "listas" },
    ]);

    await page.goto("/buscar");
    const recents = page.getByRole("region", { name: "Búsquedas recientes" });
    await expect(recents.getByRole("link")).toHaveCount(2);

    await recents.getByRole("button", { name: "Borrar “E2E uno” de recientes" }).click();
    await expect(recents.getByRole("link", { name: /E2E uno/ })).toHaveCount(0);
    await expect(recents.getByRole("link", { name: /E2E dos/ })).toBeVisible();

    await recents.getByRole("button", { name: "Borrar todo" }).click();
    await expect(page.getByRole("region", { name: "Búsquedas recientes" })).toHaveCount(0);
    expect(await countRecents(supabase, users.userA.id)).toBe(0);
  });

  test("SEARCH-04: la tab Estudios lleva al perfil del estudio", async ({ page }) => {
    await page.goto(`/buscar?q=${encodeURIComponent("[E2E] Estudio")}&en=estudios`);
    const studios = page.getByRole("list", { name: "Estudios" });
    await expect(studios.getByRole("link", { name: /\[E2E\] Estudio/ })).toContainText("2 juegos");
    await studios.getByRole("link", { name: /\[E2E\] Estudio/ }).click();

    await expect(page).toHaveURL(/\/estudios\/e2e-estudio$/);
    await expect(page.getByRole("heading", { level: 1, name: "[E2E] Estudio" })).toBeVisible();
  });

  test("SEARCH-05: la tab Listas no muestra listas privadas ajenas", async ({
    page,
    supabase,
    users,
  }) => {
    const base = `[E2E] Buscar lista ${users.runId}`;
    await supabase.from("user_lists").delete().like("title", `${base}%`);
    const { gameId } = await seedGameWithTrophies(supabase, users.userB.id, {
      n: 1,
      nameSuffix: `Lista buscada ${users.runId}`,
      np: 3002,
    });

    for (const visibility of ["public", "private"] as const) {
      const { data: list, error } = await supabase
        .from("user_lists")
        .insert({ user_id: users.userB.id, title: `${base} ${visibility}`, visibility })
        .select("id")
        .single();
      if (error || !list) throw new Error(`No se pudo seedear la lista: ${error?.message}`);
      await supabase
        .from("user_list_items")
        .insert({ list_id: list.id, game_id: gameId, position: 1 });
    }

    await page.goto(`/buscar?q=${encodeURIComponent(base)}&en=listas`);
    const lists = page.getByRole("list", { name: "Listas" });
    await expect(lists.getByRole("link", { name: literal(`${base} public`) })).toBeVisible();
    await expect(lists.getByRole("link", { name: literal(`${base} private`) })).toHaveCount(0);
  });

  test("SEARCH-06: tope de 20 recientes", async ({ page, supabase, users }) => {
    await clearRecents(supabase, users.userA.id);
    const old = Date.now() - 24 * 60 * 60 * 1000;
    await supabase.from("recent_searches").insert(
      Array.from({ length: 20 }, (_, i) => ({
        user_id: users.userA.id,
        query: `E2E vieja ${i}`,
        scope: "juegos",
        searched_at: new Date(old + i * 1000).toISOString(),
      })),
    );

    await page.goto("/buscar");
    const field = page.getByRole("searchbox", { name: "Buscar", exact: true });
    await field.fill("E2E nueva");
    await field.press("Enter");
    await expect(page).toHaveURL(/\/buscar\?q=E2E/);

    expect(await countRecents(supabase, users.userA.id)).toBe(20);
    expect(await countRecents(supabase, users.userA.id, "E2E nueva")).toBe(1);
    // La más vieja es la que se fue.
    expect(await countRecents(supabase, users.userA.id, "E2E vieja 0")).toBe(0);
  });

  test("SEARCH-07: ?q=&en= sobrevive al refresh", async ({ page }) => {
    await page.goto(`/buscar?q=${encodeURIComponent("[E2E] Estudio")}&en=usuarios`);
    await page.reload();

    await expect(page.getByRole("searchbox", { name: "Buscar", exact: true })).toHaveValue(
      "[E2E] Estudio",
    );
    await expect(page.getByRole("tab", { name: "Usuarios" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("list", { name: "Usuarios" }).or(page.getByText(/No encontramos nada/)),
    ).toBeVisible();
  });
});
