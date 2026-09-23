import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import { createTestUserClient } from "../helpers/supabase";

/**
 * Playlist (epic #183, issue #188). Casos PLIST-01..05 de TESTING_PRD.md
 * §6.22.
 *
 * En serie: todos escriben la Playlist de userA y PLIST-05 lee el orden de la
 * pantalla entera.
 */
test.describe.configure({ mode: "serial" });

/** Saca el juego de la Playlist de userA (los seeds son idempotentes, un reintento lo encuentra). */
async function resetPlaylist(supabase: SupabaseClient, userId: string, gameId: string) {
  await supabase.from("user_playlist").delete().eq("user_id", userId).eq("game_id", gameId);
  await supabase.from("now_playing").delete().eq("user_id", userId).eq("game_id", gameId);
}

async function playlistRows(supabase: SupabaseClient, userId: string, gameId: string) {
  const { data } = await supabase
    .from("user_playlist")
    .select("game_id")
    .eq("user_id", userId)
    .eq("game_id", gameId);
  return data ?? [];
}

test.describe("Playlist", () => {
  test("PLIST-01 y PLIST-02: agregar desde la ficha y quitar", async ({
    page,
    supabase,
    users,
  }) => {
    const title = testGameTitle("Playlist Toggle");
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Playlist Toggle",
      np: 2501,
    });
    await resetPlaylist(supabase, users.userA.id, gameId);

    await page.goto(`/juegos/${gameId}`);
    const toggle = page.getByRole("region", { name: "Acciones" }).getByRole("button", {
      name: "Playlist",
    });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await playlistRows(supabase, users.userA.id, gameId)).length)
      .toBe(1);

    await page.goto("/perfil/playlist");
    const grid = page.getByRole("list", { name: "Juegos de tu Playlist" });
    await expect(grid.getByRole("link", { name: title })).toBeVisible();

    // PLIST-02: quitar desde la ficha.
    await page.goto(`/juegos/${gameId}`);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => (await playlistRows(supabase, users.userA.id, gameId)).length)
      .toBe(0);

    await page.goto("/perfil/playlist");
    await expect(page.getByRole("heading", { name: "Playlist" })).toBeVisible();
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);
  });

  test("PLIST-03: marcar como jugando lo saca de la Playlist", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Playlist Jugando",
      np: 2503,
    });
    await resetPlaylist(supabase, users.userA.id, gameId);
    await supabase.from("user_playlist").insert({ user_id: users.userA.id, game_id: gameId });

    await page.goto(`/juegos/${gameId}`);
    const panel = page.getByRole("region", { name: "Acciones" });
    await expect(panel.getByRole("button", { name: "Playlist" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await panel.getByRole("button", { name: "Jugando" }).click();
    await expect(panel.getByRole("status")).toHaveText("Sacado de tu Playlist.");
    await expect(panel.getByRole("button", { name: "Playlist" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(await playlistRows(supabase, users.userA.id, gameId)).toHaveLength(0);
  });

  test("PLIST-04: la Playlist se ve en el perfil ajeno pero no se puede escribir", async ({
    browser,
    supabase,
    users,
  }) => {
    const title = testGameTitle("Playlist Ajena");
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Playlist Ajena",
      np: 2504,
    });
    await resetPlaylist(supabase, users.userA.id, gameId);
    await supabase.from("user_playlist").insert({ user_id: users.userA.id, game_id: gameId });

    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const page = await context.newPage();
    try {
      await page.goto(`/perfil/${users.userA.id}`);
      await expect(
        page.getByRole("region", { name: /^Playlist/ }).getByRole("link", { name: title }),
      ).toBeVisible();
    } finally {
      await context.close();
    }

    // La RLS, con la sesión de userB: ni agregar a la Playlist de userA...
    const asB = await createTestUserClient(users.userB.email, users.userB.password);
    const { error: insertError } = await asB
      .from("user_playlist")
      .insert({ user_id: users.userA.id, game_id: gameId });
    expect(insertError).not.toBeNull();

    // ...ni sacarle nada: un delete que la RLS filtra no falla, no borra.
    await asB.from("user_playlist").delete().eq("user_id", users.userA.id).eq("game_id", gameId);
    expect(await playlistRows(supabase, users.userA.id, gameId)).toHaveLength(1);
  });

  test("PLIST-05: ordenar por tiempo estimado pone los más cortos primero", async ({
    page,
    supabase,
    users,
  }) => {
    // Tres juegos con tiempos 30 h, 5 h y sin dato. `time_estimates_checked_at`
    // marca que ya se consultó, así nadie los pisa si alguien abre la ficha.
    const seeds = [
      { suffix: "Playlist Largo", np: 2551, minutes: 30 * 60 },
      { suffix: "Playlist Corto", np: 2552, minutes: 5 * 60 },
      { suffix: "Playlist Sin Dato", np: 2553, minutes: null },
    ];
    for (const seed of seeds) {
      const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
        n: 1,
        nameSuffix: seed.suffix,
        np: seed.np,
      });
      await resetPlaylist(supabase, users.userA.id, gameId);
      await supabase
        .from("games")
        .update({
          time_to_beat_minutes: seed.minutes,
          time_estimates_checked_at: new Date().toISOString(),
        })
        .eq("id", gameId);
      await supabase.from("user_playlist").insert({ user_id: users.userA.id, game_id: gameId });
    }

    await page.goto("/perfil/playlist?orden=tiempo");
    await expect(page.getByLabel("Ordenar por")).toHaveValue("tiempo");
    const grid = page.getByRole("list", { name: "Juegos de tu Playlist" });
    await expect(grid.getByRole("link", { name: testGameTitle("Playlist Corto") })).toBeVisible();

    const titles = await grid
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("title") ?? ""));
    const ours = titles.filter((name) => seeds.some((seed) => name === testGameTitle(seed.suffix)));
    expect(ours).toEqual([
      testGameTitle("Playlist Corto"),
      testGameTitle("Playlist Largo"),
      testGameTitle("Playlist Sin Dato"),
    ]);
  });
});
