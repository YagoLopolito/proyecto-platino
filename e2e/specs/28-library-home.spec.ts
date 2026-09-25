import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import { selectNearPlatinum } from "@/lib/library/near-platinum";
import { decodeReviewCursor, encodeReviewCursor } from "@/lib/friends/review-cursor";

/**
 * Biblioteca › Juegos y Reseñas (epic #183, issue #191). Casos LIB-10..13 de
 * TESTING_PRD.md §6.3 y REV-01..03 de §6.9.
 *
 * En serie: los REV escriben el diario de userC (el amigo de userA en estos
 * casos) y cada uno lo rehace desde cero.
 */
test.describe.configure({ mode: "serial" });

/**
 * Desbloquea para `userId` los trofeos del juego que cumplan `pick`. Los tipos
 * se leen de la base en vez de confiar en el orden que devuelve el seed.
 */
async function unlock(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
  pick: (trophy: { type: string; index: number }) => boolean,
) {
  const { data: trophies } = await supabase
    .from("trophies")
    .select("id, type, sort_order")
    .eq("game_id", gameId)
    .order("sort_order");
  const rows = (trophies ?? [])
    .filter((trophy, index) => pick({ type: trophy.type, index }))
    .map((trophy) => ({
      user_id: userId,
      trophy_id: trophy.id,
      unlocked_at: new Date().toISOString(),
    }));
  await supabase.from("user_trophies").upsert(rows, { onConflict: "user_id,trophy_id" });
}

/** Deja a userC como amigo de userA y sin ninguna entrada de diario. */
async function resetFriendDiary(
  supabase: SupabaseClient,
  users: { userA: { id: string }; userB: { id: string }; userC: { id: string } },
) {
  await supabase
    .from("friendships")
    .upsert(
      { user_id: users.userA.id, friend_id: users.userC.id },
      { onConflict: "user_id,friend_id" },
    );
  await supabase.from("game_diary_entries").delete().eq("user_id", users.userC.id);
}

test.describe("Biblioteca › Juegos", () => {
  test("LIB-12: 'Cerca del platino' muestra lo que está a más del 80% sin platinar", async ({
    page,
    supabase,
    users,
  }) => {
    // 11 trofeos: los tipos ciclan bronce/plata/oro/platino, así que hay dos
    // platinos (índices 3 y 7) y 9 que no lo son.
    const near = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 11,
      nameSuffix: "Cerca Sin Platino",
      np: 1911,
    });
    // 9/11 = 82%, sin ningún platino: cerca.
    await unlock(supabase, users.userA.id, near.gameId, ({ type }) => type !== "platinum");

    const done = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 11,
      nameSuffix: "Cerca Ya Platinado",
      np: 1912,
    });
    // 10/11 = 91%, pero con el platino ganado: ya no está "cerca" de nada.
    await unlock(supabase, users.userA.id, done.gameId, ({ index }) => index !== 0);

    const half = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 4,
      nameSuffix: "Cerca A Medias",
      np: 1913,
    });
    await unlock(supabase, users.userA.id, half.gameId, ({ index }) => index < 2);

    await page.goto("/biblioteca");
    const section = page.getByRole("region", { name: "Cerca del platino" });
    await expect(section.getByRole("link", { name: /Cerca Sin Platino/ })).toBeVisible();
    await expect(section.getByRole("link", { name: /Cerca Ya Platinado/ })).toHaveCount(0);
    await expect(section.getByRole("link", { name: /Cerca A Medias/ })).toHaveCount(0);

    // La regla, pura: orden por %, Steam cierra al 100% (no tiene platino).
    const picked = selectNearPlatinum([
      { id: "a", source: "psn", total: 10, obtained: 9, percent: 90, platinumObtained: 0 },
      { id: "b", source: "psn", total: 10, obtained: 8, percent: 80, platinumObtained: 0 },
      { id: "c", source: "steam", total: 20, obtained: 19, percent: 95, platinumObtained: 0 },
      { id: "d", source: "steam", total: 20, obtained: 20, percent: 100, platinumObtained: 0 },
      { id: "e", source: "psn", total: 10, obtained: 9, percent: 90, platinumObtained: 1 },
    ]);
    expect(picked.map((game) => game.id)).toEqual(["c", "a"]);
  });

  test("LIB-10: /biblioteca muestra las secciones en orden y los filtros siguen andando", async ({
    page,
  }) => {
    await page.goto("/biblioteca");

    const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    const position = (name: RegExp) => headings.findIndex((text) => name.test(text));
    const recos = position(/Recomendados para vos/i);
    const near = position(/Cerca del platino/i);
    const library = position(/Tu biblioteca/i);
    expect(recos).toBeGreaterThanOrEqual(0);
    expect(near).toBeGreaterThan(recos);
    expect(library).toBeGreaterThan(near);
    // "Jugando ahora" sólo aparece si hay algo, pero si está va primero.
    const playing = position(/Jugando ahora/i);
    if (playing >= 0) expect(playing).toBeLessThan(recos);

    // `?q=` sigue filtrando la grilla, en la misma URL de siempre.
    await page.goto(`/biblioteca?q=${encodeURIComponent("Cerca Sin Platino")}`);
    await expect(page.getByRole("searchbox", { name: /Buscar juego/i })).toHaveValue(
      "Cerca Sin Platino",
    );
    await expect(page.getByTestId("game-card")).toHaveCount(1);

    // `?fuente=` filtra en la query: los juegos de PSN no están en Steam.
    await page.goto("/biblioteca?fuente=steam");
    await expect(
      page.getByTestId("game-card").filter({ hasText: testGameTitle("Cerca Sin Platino") }),
    ).toHaveCount(0);
  });

  test("LIB-11: las recomendaciones de IA están en la Biblioteca y ya no en el diario", async ({
    page,
  }) => {
    await page.goto("/perfil/diario");
    await expect(page.getByRole("heading", { name: "Mi diario" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recomendados para vos" })).toHaveCount(0);

    await page.goto("/biblioteca");
    const section = page.getByRole("region", { name: "Recomendados para vos" });
    await expect(section).toBeVisible();
    await expect(section.getByText(/Contenido generado por IA/i)).toBeVisible();
  });
});

test.describe("Biblioteca › Seguí jugando", () => {
  test("LIB-13: 'Seguí jugando' no repite lo de 'Cerca del platino' y se puede sacar un juego", async ({
    page,
    supabase,
    users,
  }) => {
    const near = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 11,
      nameSuffix: "Seguir Cerca",
      np: 1915,
    });
    // 9/11 = 82% sin platino: sale en "Cerca del platino".
    await unlock(supabase, users.userA.id, near.gameId, ({ type }) => type !== "platinum");
    const half = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 4,
      nameSuffix: "Seguir A Medias",
      np: 1916,
    });
    await unlock(supabase, users.userA.id, half.gameId, ({ index }) => index < 2);

    // Una generación guardada que recomienda los dos (sin pasar por el LLM).
    const { data: row, error } = await supabase
      .from("ai_recommendations")
      .insert({
        user_id: users.userA.id,
        model: "e2e",
        payload_json: {
          perfil: "[E2E] Perfil de prueba",
          seguir_jugando: [
            { juego_id: near.gameId, motivo: "[E2E] Te falta poco", esfuerzo: "poco" },
            { juego_id: half.gameId, motivo: "[E2E] Va por la mitad", esfuerzo: "medio" },
          ],
          nuevos: [],
        },
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(`No se pudo seedear la recomendación: ${error?.message}`);

    try {
      await page.goto("/biblioteca");
      const recos = page.getByRole("region", { name: "Recomendados para vos" });
      await expect(recos.getByRole("link", { name: /Seguir A Medias/ })).toBeVisible();
      await expect(recos.getByRole("link", { name: /Seguir Cerca/ })).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: "Cerca del platino" }).getByRole("link", {
          name: /Seguir Cerca/,
        }),
      ).toBeVisible();

      await recos
        .getByRole("button", { name: `Sacar ${testGameTitle("Seguir A Medias")} de Seguí jugando` })
        .click();
      await expect(recos.getByRole("link", { name: /Seguir A Medias/ })).toHaveCount(0);
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from("user_games")
            .select("keep_playing_dismissed_at")
            .eq("user_id", users.userA.id)
            .eq("game_id", half.gameId)
            .single();
          return data?.keep_playing_dismissed_at ?? null;
        })
        .not.toBeNull();

      await page.reload();
      await expect(recos.getByRole("link", { name: /Seguir A Medias/ })).toHaveCount(0);

      // Si el sync trae una sesión posterior (lo volvió a jugar), vuelve solo.
      await supabase
        .from("user_games")
        .update({ last_played_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
        .eq("user_id", users.userA.id)
        .eq("game_id", half.gameId);
      await page.reload();
      await expect(recos.getByRole("link", { name: /Seguir A Medias/ })).toBeVisible();
    } finally {
      await supabase.from("ai_recommendations").delete().eq("id", row.id);
    }
  });
});

test.describe("Biblioteca › Reseñas", () => {
  test("REV-01: el feed muestra sólo reseñas de amigos con texto, de la más nueva a la más vieja", async ({
    page,
    supabase,
    users,
  }) => {
    await resetFriendDiary(supabase, users);
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Feed Reseñas",
      np: 1914,
    });
    await supabase.from("game_diary_entries").delete().eq("game_id", gameId);
    await supabase.from("game_diary_entries").insert([
      {
        user_id: users.userC.id,
        game_id: gameId,
        playthrough_number: 1,
        finished_on: "2026-05-01",
        rating: 6,
        review: "[E2E] Reseña vieja de userC",
      },
      {
        user_id: users.userC.id,
        game_id: gameId,
        playthrough_number: 2,
        finished_on: "2026-05-03",
        rating: 9,
        review: "[E2E] Reseña nueva de userC",
      },
      // Sólo rating: no entra (va a Actividad).
      {
        user_id: users.userC.id,
        game_id: gameId,
        playthrough_number: 3,
        finished_on: "2026-05-04",
        rating: 7,
        review: null,
      },
      // userB no es amigo de userA: no entra aunque tenga reseña.
      {
        user_id: users.userB.id,
        game_id: gameId,
        playthrough_number: 1,
        finished_on: "2026-05-05",
        rating: 10,
        review: "[E2E] Reseña de alguien que no seguís",
      },
    ]);

    await page.goto("/biblioteca/resenas");
    const rows = page.getByRole("list", { name: "Reseñas de tus amigos" }).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("[E2E] Reseña nueva de userC");
    await expect(rows.nth(1)).toContainText("[E2E] Reseña vieja de userC");
    await expect(page.getByText("[E2E] Reseña de alguien que no seguís")).toHaveCount(0);

    // El nombre del juego va en la serif (verificado por estilo computado,
    // como en el resto del sistema de diseño).
    const title = rows.nth(0).getByRole("link", { name: testGameTitle("Feed Reseñas") });
    const family = await title.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family.toLowerCase()).toMatch(/newsreader|serif/);
  });

  test("REV-02: 'Leer más' abre la ficha en la tab Reseñas con esa reseña enfocada", async ({
    page,
    supabase,
    users,
  }) => {
    await resetFriendDiary(supabase, users);
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Feed Leer Mas",
      np: 1915,
    });
    const longReview = Array.from(
      { length: 12 },
      (_, i) => `[E2E] Párrafo ${i + 1} de una reseña larga que no entra en seis líneas.`,
    ).join("\n");
    const { data: entry } = await supabase
      .from("game_diary_entries")
      .insert({
        user_id: users.userC.id,
        game_id: gameId,
        playthrough_number: 1,
        finished_on: "2026-05-10",
        rating: 8,
        review: longReview,
      })
      .select("id")
      .single();

    await page.goto("/biblioteca/resenas");
    await page
      .getByRole("link", { name: /Leer más/ })
      .first()
      .click();

    await expect(page).toHaveURL(new RegExp(`/juegos/${gameId}/resenas\\?resena=${entry!.id}#`));
    const focused = page.locator(`li[aria-current="true"]`);
    await expect(focused).toHaveCount(1);
    // En la ficha la reseña va entera, incluido el último párrafo.
    await expect(focused).toContainText("[E2E] Párrafo 12");
    await expect(focused).toBeInViewport();
  });

  test("REV-03: 'Cargar más' suma la página siguiente debajo", async ({
    page,
    supabase,
    users,
  }) => {
    await resetFriendDiary(supabase, users);
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Feed Paginado",
      np: 1916,
    });
    // 25 reseñas: la primera página son 20.
    await supabase.from("game_diary_entries").insert(
      Array.from({ length: 25 }, (_, i) => ({
        user_id: users.userC.id,
        game_id: gameId,
        playthrough_number: i + 1,
        finished_on: `2026-03-${String(i + 1).padStart(2, "0")}`,
        rating: 7,
        review: `[E2E] Reseña paginada ${i + 1}`,
      })),
    );

    await page.goto("/biblioteca/resenas");
    const rows = page.getByRole("list", { name: "Reseñas de tus amigos" }).getByRole("listitem");
    await expect(rows).toHaveCount(20);
    await expect(rows.first()).toContainText("[E2E] Reseña paginada 25");

    await page.getByRole("button", { name: "Cargar más" }).click();
    await expect(rows).toHaveCount(25);
    // Sin repetidas y en orden: la última es la más vieja.
    await expect(rows.nth(20)).toContainText("[E2E] Reseña paginada 5");
    await expect(rows.last()).toContainText("[E2E] Reseña paginada 1");
    // El foco pasa a la primera reseña nueva, y no queda otra página.
    await expect(rows.nth(20)).toBeFocused();
    await expect(page.getByRole("button", { name: "Cargar más" })).toHaveCount(0);

    // El cursor, puro: ida y vuelta, y basura del cliente no pasa.
    const cursor = {
      finishedOn: "2026-03-05",
      createdAt: "2026-09-23T12:00:00.123456+00:00",
      id: "0b8f3a52-3c1e-4c55-9d7c-2a1f7b0c9e11",
    };
    expect(decodeReviewCursor(encodeReviewCursor(cursor))).toEqual(cursor);
    expect(decodeReviewCursor("no-es-un-cursor")).toBeNull();
    expect(
      decodeReviewCursor(
        Buffer.from(JSON.stringify(["2026-03-05", "x),id.gt.0", cursor.id])).toString("base64url"),
      ),
    ).toBeNull();
  });
});
