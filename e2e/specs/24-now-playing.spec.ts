import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import { createTestUserClient } from "../helpers/supabase";

/**
 * "Jugando ahora" (epic #183, issue #187). Casos PLAY-01..03 y PLAY-05..07 de
 * TESTING_PRD.md §6.21; PLAY-04 (salida por platino en el sync) vive en
 * `03-sync-library.spec.ts`, que es el que conecta la cuenta PSN mockeada.
 *
 * En serie: PLAY-01 y PLAY-07 dependen de cuál es el juego abierto más
 * recientemente de userA, y dos tests de este archivo en paralelo se pisarían
 * la sugerencia (PLAY-01 seedea el más reciente, así un reintento no se
 * encuentra con el de PLAY-07). El `last_played_at` que seedean va **en el
 * futuro** por lo mismo con otros archivos: el sync mockeado de Steam
 * (13-steam, también userA) escribe `last_played_at = ahora`, y un "ahora"
 * nuestro podía perder.
 */
test.describe.configure({ mode: "serial" });

const HOUR_MS = 60 * 60 * 1000;

async function setLastPlayed(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
  hoursFromNow: number,
) {
  const { error } = await supabase
    .from("user_games")
    .update({ last_played_at: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString() })
    .eq("user_id", userId)
    .eq("game_id", gameId);
  if (error) throw new Error(`No se pudo seedear last_played_at: ${error.message}`);
}

/**
 * Deja el juego como recién seedeado: sin rachas y sin sugerencia descartada.
 * Los seeds son idempotentes (upsert), así que en un reintento el juego ya
 * existe con lo que dejó la corrida anterior.
 */
async function resetNowPlaying(supabase: SupabaseClient, userId: string, gameId: string) {
  await supabase.from("now_playing").delete().eq("user_id", userId).eq("game_id", gameId);
  await supabase
    .from("user_games")
    .update({ play_suggestion_dismissed_at: null })
    .eq("user_id", userId)
    .eq("game_id", gameId);
}

async function openSessions(supabase: SupabaseClient, userId: string, gameId: string) {
  const { data } = await supabase
    .from("now_playing")
    .select("id, ended_at, end_reason")
    .eq("user_id", userId)
    .eq("game_id", gameId);
  return data ?? [];
}

test.describe("Jugando ahora", () => {
  test("PLAY-01: el + sugiere el último juego abierto y lo marca como jugando", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Jugando Sugerido",
      np: 2401,
    });
    await resetNowPlaying(supabase, users.userA.id, gameId);
    // El más reciente de todo el archivo: PLAY-07 seedea el suyo más atrás.
    await setLastPlayed(supabase, users.userA.id, gameId, 96);

    await page.goto("/biblioteca");
    await page.getByRole("banner").getByRole("button", { name: "Registrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar" });
    await expect(
      dialog.getByRole("heading", { name: `¿Estás jugando ${testGameTitle("Jugando Sugerido")}?` }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Sí, lo estoy jugando" }).click();
    await expect(dialog.getByRole("status")).toHaveText(/Listo, está en “Jugando ahora”/);

    const sessions = await openSessions(supabase, users.userA.id, gameId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].ended_at).toBeNull();
  });

  test("PLAY-02: marcar como jugando aparece en el perfil propio, en el ajeno y en la ficha", async ({
    page,
    browser,
    supabase,
    users,
  }) => {
    const title = testGameTitle("Jugando Ficha");
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Jugando Ficha",
      np: 2402,
    });
    await resetNowPlaying(supabase, users.userA.id, gameId);

    await page.goto(`/juegos/${gameId}`);
    const toggle = page.getByRole("region", { name: "Acciones" }).getByRole("button", {
      name: "Jugando",
    });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // El toggle es optimista: `aria-pressed` cambia antes de que la action
    // termine. Navegar sin esperar a la racha guardada es una carrera que el
    // perfil pierde cuando la action tarda.
    await expect
      .poll(async () => (await openSessions(supabase, users.userA.id, gameId)).length)
      .toBe(1);

    await page.goto("/perfil");
    const ownSection = page.getByRole("region", { name: "Jugando ahora" });
    await expect(ownSection.getByRole("link", { name: title })).toBeVisible();

    // `now_playing` es público: otro usuario lo ve en el perfil de userA.
    const context = await browser.newContext({ storageState: "e2e/.auth/user-b.json" });
    const other = await context.newPage();
    try {
      await other.goto(`/perfil/${users.userA.id}`);
      await expect(
        other.getByRole("region", { name: "Jugando ahora" }).getByRole("link", { name: title }),
      ).toBeVisible();
    } finally {
      await context.close();
    }

    await ownSection.getByRole("button", { name: `Dejé de jugar ${title}` }).click();
    await expect(ownSection.getByRole("link", { name: title })).toHaveCount(0);

    const sessions = await openSessions(supabase, users.userA.id, gameId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].end_reason).toBe("manual");
  });

  test("PLAY-03: registrar una partida lo saca de jugando", async ({ page, supabase, users }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Jugando Diario",
      np: 2403,
    });
    await resetNowPlaying(supabase, users.userA.id, gameId);
    await supabase.from("now_playing").insert({ user_id: users.userA.id, game_id: gameId });

    await page.goto(`/juegos/${gameId}`);
    const panel = page.getByRole("region", { name: "Acciones" });
    await expect(panel.getByRole("button", { name: "Jugando" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await panel.getByRole("button", { name: "Registrar o puntuar" }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar o puntuar" });
    await dialog.getByLabel("Reseña (opcional)").fill("[E2E] Terminado mientras lo jugaba");
    await dialog.getByRole("button", { name: "Guardar en el diario" }).click();
    await expect(dialog.getByText("Entrada guardada en el diario.")).toBeVisible();

    await expect
      .poll(async () => (await openSessions(supabase, users.userA.id, gameId))[0]?.end_reason)
      .toBe("diary_entry");
  });

  test("PLAY-05: el mismo juego no puede estar jugando dos veces", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Jugando Doble",
      np: 2405,
    });
    await resetNowPlaying(supabase, users.userA.id, gameId);

    await page.goto(`/juegos/${gameId}`);
    const panel = page.getByRole("region", { name: "Acciones" });
    const toggle = panel.getByRole("button", { name: "Jugando" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    // Otra pestaña (acá, la base directo) lo marcó mientras esta ficha seguía
    // abierta: el click de esta pestaña choca con el unique de rachas abiertas.
    await supabase.from("now_playing").insert({ user_id: users.userA.id, game_id: gameId });
    await toggle.click();
    await expect(panel.getByText("Ya lo estás jugando.")).toBeVisible();

    const sessions = await openSessions(supabase, users.userA.id, gameId);
    expect(sessions.filter((session) => session.ended_at === null)).toHaveLength(1);
  });

  test("PLAY-06: otro usuario no puede escribir tu now_playing", async ({ supabase, users }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Jugando RLS",
      np: 2406,
    });
    await resetNowPlaying(supabase, users.userA.id, gameId);
    const { data: own } = await supabase
      .from("now_playing")
      .insert({ user_id: users.userA.id, game_id: gameId })
      .select("id")
      .single();

    const asB = await createTestUserClient(users.userB.email, users.userB.password);

    const { error: insertError } = await asB
      .from("now_playing")
      .insert({ user_id: users.userA.id, game_id: gameId });
    expect(insertError).not.toBeNull();

    // Un update que la RLS filtra no es un error: simplemente no toca filas.
    await asB
      .from("now_playing")
      .update({ ended_at: new Date().toISOString(), end_reason: "manual" })
      .eq("id", own!.id);
    const sessions = await openSessions(supabase, users.userA.id, gameId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].ended_at).toBeNull();

    // Leer sí: "Jugando ahora" se muestra en perfiles públicos.
    const { data: visible } = await asB.from("now_playing").select("id").eq("id", own!.id);
    expect(visible).toHaveLength(1);
  });

  test("PLAY-07: la biblioteca sugiere el juego abierto hace poco y se puede descartar", async ({
    page,
    supabase,
    users,
  }) => {
    const title = testGameTitle("Jugando Banner");
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Jugando Banner",
      np: 2407,
    });
    await resetNowPlaying(supabase, users.userA.id, gameId);
    await setLastPlayed(supabase, users.userA.id, gameId, 48);

    await page.goto("/biblioteca");
    const banner = page.getByRole("complementary", { name: "Sugerencia de jugando ahora" });
    await expect(banner).toContainText(`¿Empezaste ${title}?`);

    await banner.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByText(`¿Empezaste ${title}?`)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Mi biblioteca" })).toBeVisible();
    await expect(page.getByText(`¿Empezaste ${title}?`)).toHaveCount(0);
    expect(await openSessions(supabase, users.userA.id, gameId)).toHaveLength(0);
  });
});
