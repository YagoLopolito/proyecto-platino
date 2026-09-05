import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";

/**
 * Detalle de juego (`/juegos/[id]`). Casos GAME-01 y GAME-07 de
 * TESTING_PRD.md §6.4 (los P0). El resto del catálogo de trofeos se seedea
 * directo con service role (`seedGameWithTrophies`) en vez de pasar por el
 * sync mockeado: no hay nada de PSN que estos casos necesiten ejercitar.
 */
test.describe("Detalle de juego", () => {
  test("GAME-01: la lista de trofeos trae todos los del fixture", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 6,
      nameSuffix: "Detalle Uno",
      np: 101,
    });

    await page.goto(`/juegos/${gameId}`);
    await expect(page.getByRole("heading", { name: /Trofeos\s+6/i })).toBeVisible();

    for (let i = 1; i <= 6; i++) {
      await expect(page.getByText(`Trofeo ${i}`, { exact: false })).toBeVisible();
    }
  });

  test("GAME-07: no se filtran trofeos ajenos al abrir el juego de otro usuario", async ({
    browser,
    supabase,
    users,
  }) => {
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 4,
      nameSuffix: "Detalle Ajeno",
      np: 102,
    });

    // userA desbloquea 2 de los 4 trofeos.
    await supabase.from("user_trophies").upsert(
      trophyIds.slice(0, 2).map((trophyId) => ({
        user_id: users.userA.id,
        trophy_id: trophyId,
        unlocked_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,trophy_id" },
    );

    // userB también tiene el juego en su biblioteca (games/trophies son
    // catálogo compartido), pero nunca desbloqueó nada.
    await supabase
      .from("user_games")
      .upsert({ user_id: users.userB.id, game_id: gameId }, { onConflict: "user_id,game_id" });

    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const page = await context.newPage();
    try {
      await page.goto(`/juegos/${gameId}`);
      // El % de completitud de userB tiene que ser 0/4: si se filtraran mal
      // los trofeos ajenos, acá aparecería el progreso de userA. Los dos
      // números viven en celdas separadas de la tira de stats del encabezado.
      const stats = page.getByRole("definition");
      await expect(stats.filter({ hasText: "0/4" })).toBeVisible();
      await expect(stats.filter({ hasText: "0%" }).first()).toBeVisible();
    } finally {
      await context.close();
      await supabase
        .from("user_games")
        .delete()
        .eq("user_id", users.userB.id)
        .eq("game_id", gameId);
    }
  });

  test("GAME-08: la ficha cachea los datos de catálogo aunque el juego lo haya creado otro usuario", async ({
    browser,
    supabase,
    users,
  }) => {
    // El juego lo crea userA: la RLS de `games` sólo deja actualizar las filas
    // propias, así que este es exactamente el caso que antes no cacheaba nada
    // (y dejaba la ficha sin fondo ni descripción, volviendo a pegarle a las
    // APIs externas en cada visita).
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Cache Ajeno",
      np: 103,
    });

    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const page = await context.newPage();
    try {
      await page.goto(`/juegos/${gameId}/diario`);
      await expect(page.getByRole("heading", { name: testGameTitle("Cache Ajeno") })).toBeVisible();

      // `background_url` se escribe siempre que se haya intentado buscarlo
      // (string vacío = "ya buscamos y no había"), así que sirve de marca de
      // que el update realmente entró, sin depender de ninguna API externa.
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from("games")
            .select("background_url")
            .eq("id", gameId)
            .single();
          return data?.background_url ?? null;
        })
        .not.toBeNull();
    } finally {
      await context.close();
    }
  });
});
