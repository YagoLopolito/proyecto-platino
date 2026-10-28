import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { createTestUserClient } from "../helpers/supabase";
import { testGameCommId, testGameTitle } from "../helpers/ids";
import { CELEBRATION_WINDOW_DAYS, shouldCelebratePlatinum } from "@/lib/platinum/celebration";
import {
  daysToPlatinum,
  formatDaysToPlatinum,
  formatEarnedRate,
  formatPlatinumDate,
  showcaseStats,
  sortPieces,
  type PlatinumPiece,
} from "@/lib/platinum/stats";

/**
 * Impacto del platino: biblioteca, ficha del juego (hero, ficha del platino y
 * lluvia), celebración de platinos nuevos, vitrina, compartir en la Galería
 * online y las preferencias de efectos y sonido. Casos PLAT-01..PLAT-10 de
 * TESTING_PRD.md §6.29.
 *
 * Serial: PLAT-10 apaga los efectos de userA y otros casos de este archivo
 * miran la lluvia. Los platinos se siembran con `celebrated_at` en su default
 * (`now()`, "ya celebrado"): uno en NULL le abriría la celebración a cualquier
 * otro spec que esté navegando como userA en paralelo, así que la cola de
 * PLAT-06 se mockea con `page.route`.
 */
test.describe.configure({ mode: "serial" });

const PLATINUM_AT = "2026-03-10T15:00:00Z";
const FIRST_TROPHY_AT = "2026-03-01T15:00:00Z";

/** Juego con platino: los tres primeros trofeos el 1/3 y el platino el 10/3. */
async function seedPlatinumGame(
  supabase: SupabaseClient,
  userId: string,
  suffix: string,
  np: number,
) {
  const { gameId, trophyIds } = await seedGameWithTrophies(supabase, userId, {
    n: 4,
    nameSuffix: suffix,
    np,
  });
  await supabase.from("user_trophies").upsert(
    trophyIds.map((trophyId, index) => ({
      user_id: userId,
      trophy_id: trophyId,
      unlocked_at: index === 3 ? PLATINUM_AT : FIRST_TROPHY_AT,
    })),
    { onConflict: "user_id,trophy_id" },
  );
  return { gameId, title: testGameTitle(suffix) };
}

/**
 * Juego al 95% sin el platino: 19 bronces obtenidos de 19 y el platino
 * pendiente (el seed genérico intercala un platino cada cuatro trofeos y así
 * nunca pasa del 80% sin él).
 */
async function seedNearPlatinumGame(
  supabase: SupabaseClient,
  userId: string,
  suffix: string,
  np: number,
) {
  const { data: game } = await supabase
    .from("games")
    .upsert(
      {
        np_comm_id: testGameCommId(np),
        name: testGameTitle(suffix),
        platform: "PS5",
        created_by: userId,
        source: "psn",
      },
      { onConflict: "np_comm_id" },
    )
    .select("id")
    .single();
  const gameId = game!.id as string;
  const { data: trophies } = await supabase
    .from("trophies")
    .upsert(
      Array.from({ length: 20 }, (_, i) => ({
        game_id: gameId,
        trophy_id: `n${i + 1}`,
        name: `${testGameTitle(suffix)} - Trofeo ${i + 1}`,
        type: i === 19 ? "platinum" : "bronze",
        hidden: false,
        sort_order: i,
        created_by: userId,
      })),
      { onConflict: "game_id,trophy_id" },
    )
    .select("id, type");
  await supabase
    .from("user_games")
    .upsert({ user_id: userId, game_id: gameId }, { onConflict: "user_id,game_id" });
  await supabase.from("user_trophies").upsert(
    (trophies ?? [])
      .filter((trophy) => trophy.type === "bronze")
      .map((trophy) => ({ user_id: userId, trophy_id: trophy.id, unlocked_at: FIRST_TROPHY_AT })),
    { onConflict: "user_id,trophy_id" },
  );
  return { gameId, title: testGameTitle(suffix) };
}

function piece(overrides: Partial<PlatinumPiece>): PlatinumPiece {
  return {
    userTrophyId: "00000000-0000-4000-8000-000000000001",
    gameId: "g",
    name: "Juego",
    imageUrl: null,
    unlockedAt: "2026-01-10T12:00:00Z",
    earnedRate: null,
    firstUnlockedAt: null,
    number: 1,
    ...overrides,
  };
}

test.describe("Reglas puras", () => {
  test("PLAT-01: sólo se celebra un platino nuevo, reciente y que no venga del primer sync", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    const recent = "2026-10-27T12:00:00Z";
    const old = new Date(now.getTime() - (CELEBRATION_WINDOW_DAYS + 1) * 86_400_000).toISOString();

    expect(
      shouldCelebratePlatinum({ alreadyHad: false, hadPreviousSync: true, earnedAt: recent, now }),
    ).toBe(true);
    // Ya estaba en la base: no es nuevo.
    expect(
      shouldCelebratePlatinum({ alreadyHad: true, hadPreviousSync: true, earnedAt: recent, now }),
    ).toBe(false);
    // Primer sync de la cuenta: todo es historia.
    expect(
      shouldCelebratePlatinum({ alreadyHad: false, hadPreviousSync: false, earnedAt: recent, now }),
    ).toBe(false);
    // De hace más de la ventana.
    expect(
      shouldCelebratePlatinum({ alreadyHad: false, hadPreviousSync: true, earnedAt: old, now }),
    ).toBe(false);
    expect(
      shouldCelebratePlatinum({ alreadyHad: false, hadPreviousSync: true, earnedAt: null, now }),
    ).toBe(false);
  });

  test("PLAT-02: cuentas de la vitrina (más raro, más rápido, mejor año, orden y fechas)", () => {
    const pieces = [
      piece({
        gameId: "a",
        name: "A",
        number: 1,
        unlockedAt: "2025-05-10T12:00:00Z",
        firstUnlockedAt: "2025-05-01T12:00:00Z",
        earnedRate: 12.5,
      }),
      piece({
        gameId: "b",
        name: "B",
        number: 2,
        unlockedAt: "2026-02-10T12:00:00Z",
        firstUnlockedAt: "2026-02-08T12:00:00Z",
        earnedRate: 0.45,
      }),
      piece({ gameId: "c", name: "C", number: 3, unlockedAt: "2026-06-01T12:00:00Z" }),
    ];

    const stats = showcaseStats(pieces);
    expect(stats.total).toBe(3);
    expect(stats.rarest?.gameId).toBe("b");
    expect(stats.fastest).toMatchObject({ gameId: "b", days: 2 });
    expect(stats.bestYear).toEqual({ year: 2026, count: 2 });

    expect(sortPieces(pieces, "antiguos").map((p) => p.gameId)).toEqual(["a", "b", "c"]);
    expect(sortPieces(pieces, "recientes").map((p) => p.gameId)).toEqual(["c", "b", "a"]);
    // Los que no tienen rareza van al final.
    expect(sortPieces(pieces, "rareza").map((p) => p.gameId)).toEqual(["b", "a", "c"]);

    expect(daysToPlatinum(null, "2026-01-01T00:00:00Z")).toBeNull();
    expect(formatDaysToPlatinum(0)).toBe("en el mismo día");
    expect(formatDaysToPlatinum(9)).toBe("en 9 días");
    expect(formatEarnedRate(3.2)).toBe("3,2%");
    expect(formatEarnedRate(0.45)).toBe("0,45%");
    // La noche del 31/12 en Buenos Aires ya es enero en UTC: cuenta el 31/12.
    expect(formatPlatinumDate("2026-01-01T02:00:00Z")).toBe("31/12/2025");
  });
});

test.describe("Platino en la app", () => {
  test("PLAT-03: la biblioteca destaca los platinados, con fecha, orden y contador", async ({
    page,
    supabase,
    users,
  }) => {
    const prefix = `Plat Biblio ${users.runId}`;
    const platinum = await seedPlatinumGame(supabase, users.userA.id, `${prefix} Oro`, 3901);
    const near = await seedNearPlatinumGame(supabase, users.userA.id, `${prefix} Casi`, 3902);

    await page.goto(`/biblioteca?q=${encodeURIComponent(prefix)}`);
    const platinumCard = page.getByTestId("game-card").filter({ hasText: platinum.title });
    await expect(platinumCard.locator("[data-platinum]")).toHaveCount(1);
    await expect(platinumCard.getByRole("img", { name: "Platino" })).toBeVisible();
    await expect(platinumCard).toContainText("Platinado el 10/03/2026");

    const nearCard = page.getByTestId("game-card").filter({ hasText: near.title });
    await expect(nearCard).toContainText("A punto de platinar");
    await expect(nearCard.locator("[data-platinum]")).toHaveCount(0);

    await page.getByLabel("Ordenar por").selectOption("platinum");
    await expect(page.getByTestId("game-card").first()).toContainText(platinum.title);

    const counter = page.getByTestId("platinum-counter");
    await expect(counter).toContainText(/\d+ platinos?/);
    await counter.click();
    await expect(page).toHaveURL(/\/vitrina$/);
  });

  test("PLAT-04: la ficha de un juego platinado tiene hero, ficha del platino y lluvia", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId, title } = await seedPlatinumGame(
      supabase,
      users.userA.id,
      `Plat Ficha ${users.runId}`,
      3903,
    );

    await page.goto(`/juegos/${gameId}`);
    const showcase = page.getByTestId("game-platinum");
    await expect(showcase).toContainText(/Tu platino #\d+/);
    await expect(showcase).toContainText("10/03/2026");
    await expect(showcase).toContainText("en 9 días");

    // La lluvia arranca sola al entrar y se va sola a los pocos segundos.
    const rain = page.getByTestId("platinum-rain");
    await expect(rain).toBeVisible();
    await expect(rain).toHaveAttribute("aria-hidden", "true");
    await expect(rain).toHaveCount(0);

    await showcase.getByRole("button", { name: "¡Otra vez!" }).click();
    await expect(rain).toBeVisible();

    // El platino va separado arriba de la lista, y no se repite abajo.
    const platinumRow = page.getByTestId("platinum-trophy-row");
    await expect(platinumRow).toContainText(`${title} - Trofeo 4`);
    await expect(page.getByText(`${title} - Trofeo 4`)).toHaveCount(1);
  });

  test("PLAT-05: con prefers-reduced-motion no hay lluvia ni reflejo animado", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedPlatinumGame(
      supabase,
      users.userA.id,
      `Plat Quieto ${users.runId}`,
      3904,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/juegos/${gameId}`);

    await expect(page.getByTestId("game-platinum")).toBeVisible();
    // Las preferencias ya llegaron (el provider marca <html>): recién ahí la
    // ausencia de la lluvia dice algo.
    await expect(page.locator("html")).toHaveAttribute("data-platinum-fx", /on|off/);
    await expect(page.getByTestId("platinum-rain")).toHaveCount(0);

    const sheenDisplay = await page
      .locator(".platinum-sheen")
      .first()
      .evaluate((el) => getComputedStyle(el, "::after").display);
    expect(sheenDisplay).toBe("none");
  });

  test("PLAT-06: los platinos nuevos se celebran uno por vez y se marcan en el servidor", async ({
    page,
  }) => {
    const items = [
      piece({
        userTrophyId: "00000000-0000-4000-8000-0000000000a1",
        gameId: "00000000-0000-4000-8000-0000000000b1",
        name: "[E2E] Celebración Uno",
        number: 7,
      }),
      piece({
        userTrophyId: "00000000-0000-4000-8000-0000000000a2",
        gameId: "00000000-0000-4000-8000-0000000000b2",
        name: "[E2E] Celebración Dos",
        number: 8,
      }),
    ];
    const celebrated: string[] = [];
    await page.route("**/api/platino/estado", (route) =>
      route.fulfill({ json: { prefs: { sound: false, effects: false }, pending: items } }),
    );
    await page.route("**/api/platino/celebrado", async (route) => {
      celebrated.push((route.request().postDataJSON() as { userTrophyId: string }).userTrophyId);
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto("/biblioteca");
    const dialog = page.getByRole("dialog", { name: "¡Platino desbloqueado!" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("1 de 2");
    await expect(dialog).toContainText("Celebración Uno");
    await expect(dialog).toContainText("Tu platino #7");

    // Foco atrapado: arranca en la acción principal y Shift+Tab da la vuelta.
    await expect(dialog.getByRole("link", { name: "Ver en la vitrina" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Siguiente" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toContainText("2 de 2");
    await expect(dialog).toContainText("Celebración Dos");
    await expect.poll(() => celebrated).toEqual([items[0].userTrophyId]);

    await dialog.getByRole("button", { name: "Cerrar" }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => celebrated).toEqual(items.map((item) => item.userTrophyId));
  });

  test("PLAT-07: la vitrina muestra la colección, ordena y reemplaza a /perfil/platinos", async ({
    page,
    supabase,
    users,
  }) => {
    const { title } = await seedPlatinumGame(
      supabase,
      users.userA.id,
      `Plat Vitrina ${users.runId}`,
      3905,
    );
    await seedNearPlatinumGame(supabase, users.userA.id, `Plat Vitrina Casi ${users.runId}`, 3906);

    await page.goto("/perfil/platinos");
    await expect(page).toHaveURL(/\/vitrina$/);
    await expect(page.getByRole("heading", { name: "Vitrina", level: 1 })).toBeVisible();

    const ownPiece = page.getByTestId("platinum-game").filter({ hasText: title });
    await expect(ownPiece).toContainText(/#\d+/);
    await expect(ownPiece).toContainText("10/03/2026");
    await expect(page.getByTestId("showcase-stats")).toContainText("Platinos");
    // Al menos un hueco de "Tu próximo platino" (userA tiene un juego al 95%).
    await expect(page.getByTestId("next-platinum-slot").first()).toContainText(
      "Tu próximo platino",
    );

    const rarest = page.getByRole("link", { name: "Más raros" });
    await rarest.click();
    await expect(page).toHaveURL(/\/vitrina\?orden=rareza$/);
    await expect(page.getByRole("link", { name: "Más raros" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("PLAT-08: compartir un platino publica la card en la Galería online, destacada", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedPlatinumGame(
      supabase,
      users.userA.id,
      `Plat Compartir ${users.runId}`,
      3907,
    );
    const near = await seedNearPlatinumGame(
      supabase,
      users.userA.id,
      `Plat Compartir Casi ${users.runId}`,
      3908,
    );

    // La card la dibuja el servidor, sólo para un platino propio.
    const card = await page.request.get(`/api/platino/${gameId}/tarjeta`);
    expect(card.status()).toBe(200);
    expect(card.headers()["content-type"]).toContain("image/png");
    expect((await page.request.get(`/api/platino/${near.gameId}/tarjeta`)).status()).toBe(404);

    await page.goto(`/juegos/${gameId}`);
    await page
      .getByTestId("game-platinum")
      .getByRole("button", { name: "Compartir en actividad" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Compartir en actividad" });
    await expect(dialog.getByRole("img", { name: /Card de platino de/ })).toBeVisible();
    // Texto único por intento: el archivo es serial y, si otro caso falla,
    // Playwright reintenta el grupo entero y este caso vuelve a publicar.
    const caption = `[E2E] ¡por fin! ${users.runId}-${test.info().retry}`;
    await dialog.getByLabel("Texto (opcional)").fill(caption);
    await dialog.getByRole("button", { name: "Publicar en la Galería" }).click();
    await expect(dialog.getByRole("status")).toContainText("ya está en la Galería online");

    await page.goto("/actividad/galeria");
    const post = page.locator('[data-testid="post-card"][data-kind="platinum"]').filter({
      hasText: caption,
    });
    await expect(post).toBeVisible();
    await expect(post.getByTestId("platinum-post-badge")).toBeVisible();
  });

  test("PLAT-09: la base no deja marcar como platino una publicación sin platino", async ({
    supabase,
    users,
  }) => {
    const platinum = await seedPlatinumGame(
      supabase,
      users.userA.id,
      `Plat Trigger ${users.runId}`,
      3909,
    );
    const near = await seedNearPlatinumGame(
      supabase,
      users.userA.id,
      `Plat Trigger Casi ${users.runId}`,
      3910,
    );
    const asA = await createTestUserClient(users.userA.email, users.userA.password);

    const rejected = await asA
      .from("posts")
      .insert({ user_id: users.userA.id, game_id: near.gameId, kind: "platinum" })
      .select("id");
    expect(rejected.error?.message).toContain("platino");

    const accepted = await asA
      .from("posts")
      .insert({ user_id: users.userA.id, game_id: platinum.gameId, kind: "platinum" })
      .select("id")
      .single();
    expect(accepted.error).toBeNull();

    // El tipo no cambia una vez creado.
    const photo = await asA
      .from("posts")
      .insert({ user_id: users.userA.id, game_id: near.gameId })
      .select("id")
      .single();
    const changed = await asA.from("posts").update({ kind: "platinum" }).eq("id", photo.data!.id);
    expect(changed.error?.message).toContain("tipo");

    await supabase.from("posts").delete().in("id", [accepted.data!.id, photo.data!.id]);
  });

  test("PLAT-10: apagar los efectos se guarda, apaga la lluvia y deja el destaque fijo", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedPlatinumGame(
      supabase,
      users.userA.id,
      `Plat Sin Efectos ${users.runId}`,
      3911,
    );
    try {
      await page.goto("/configuracion/perfil");
      const effects = page.getByRole("switch", { name: "Efectos visuales" });
      await expect(effects).toHaveAttribute("aria-checked", "true");
      await effects.click();
      await expect(effects).toHaveAttribute("aria-checked", "false");
      await expect(page.locator("html")).toHaveAttribute("data-platinum-fx", "off");

      await expect
        .poll(async () => {
          const { data } = await supabase
            .from("users")
            .select("platinum_effects_enabled, platinum_sound_enabled")
            .eq("id", users.userA.id)
            .single();
          return data;
        })
        .toEqual({ platinum_effects_enabled: false, platinum_sound_enabled: true });

      await page.reload();
      await expect(page.getByRole("switch", { name: "Efectos visuales" })).toHaveAttribute(
        "aria-checked",
        "false",
      );

      await page.goto(`/juegos/${gameId}`);
      await expect(page.getByTestId("game-platinum")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-platinum-fx", "off");
      await expect(page.getByTestId("platinum-rain")).toHaveCount(0);
      // El marco y el trofeo siguen: el destaque queda, sin movimiento.
      await expect(
        page.getByTestId("game-platinum").getByRole("img", { name: "Trofeo de platino" }),
      ).toBeVisible();
    } finally {
      await supabase
        .from("users")
        .update({ platinum_effects_enabled: true, platinum_sound_enabled: true })
        .eq("id", users.userA.id);
    }
  });
});
