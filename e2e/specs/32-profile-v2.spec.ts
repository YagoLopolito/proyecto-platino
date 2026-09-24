import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import {
  entriesForRatingStep,
  ratingHistogram,
  summarizePlayed,
  yearOfDate,
  yearOfInstant,
} from "@/lib/profile/stats";

/**
 * Perfil › Perfil (epic #183, issue #196). Casos PROF-13..PROF-20 de
 * TESTING_PRD.md §6.10 (el issue los numeraba PROF-10..16, pero esos ids ya
 * estaban tomados por el rediseño anterior del perfil).
 *
 * El diario de userA lo escriben también otros specs en paralelo, así que acá
 * no se afirman totales exactos del histograma: se verifica lo que depende
 * sólo de los juegos seedeados en cada caso.
 */
test.describe.configure({ mode: "serial" });

async function unlockPlatinum(supabase: SupabaseClient, userId: string, gameId: string) {
  const { data: trophies } = await supabase
    .from("trophies")
    .select("id")
    .eq("game_id", gameId)
    .eq("type", "platinum");
  await supabase.from("user_trophies").upsert(
    (trophies ?? []).map((trophy) => ({
      user_id: userId,
      trophy_id: trophy.id,
      unlocked_at: "2026-03-10T15:00:00Z",
    })),
    { onConflict: "user_id,trophy_id" },
  );
}

test("PROF-13: el perfil muestra las secciones en el orden de Letterboxd", async ({ page }) => {
  await page.goto("/perfil");

  const headings = await page
    .getByRole("heading", {
      name: /^(Favoritos|Últimas reseñas|Tus puntuaciones|Estadísticas)$/,
    })
    .allTextContents();
  expect(headings).toEqual(["Favoritos", "Últimas reseñas", "Tus puntuaciones", "Estadísticas"]);
  // El desglose de trofeos de PSN se mudó al expandido de Platinos.
  await expect(page.getByText("PlayStation Network · trofeos por tipo")).toHaveCount(0);
});

test("PROF-14: el histograma cuenta el último rating de cada juego", async () => {
  const entries = [
    { id: "a1", gameId: "a", rating: 2, playthroughNumber: 1 },
    { id: "a2", gameId: "a", rating: 9, playthroughNumber: 2 },
    // Una rejugada sin puntuar no borra la puntuación anterior.
    { id: "b1", gameId: "b", rating: 6, playthroughNumber: 1 },
    { id: "b2", gameId: "b", rating: null, playthroughNumber: 2 },
  ];
  const histogram = ratingHistogram(entries);

  expect(histogram.total).toBe(2);
  expect(histogram.counts[9 - 1]).toBe(1);
  expect(histogram.counts[6 - 1]).toBe(1);
  expect(histogram.counts[2 - 1]).toBe(0);
  expect(histogram.averageStars).toBe(3.75);
  expect(entriesForRatingStep(entries, 9).map((e) => e.id)).toEqual(["a2"]);
  expect(entriesForRatingStep(entries, 2)).toEqual([]);
});

test("PROF-15: tocar una barra del histograma filtra las reseñas por ese rating", async ({
  page,
  supabase,
  users,
}) => {
  const game = await seedGameWithTrophies(supabase, users.userA.id, {
    n: 1,
    nameSuffix: "Histograma",
    np: 3201,
  });
  await supabase.from("game_diary_entries").upsert(
    [
      {
        user_id: users.userA.id,
        game_id: game.gameId,
        playthrough_number: 1,
        rating: 3,
        finished_on: "2026-02-01",
      },
      {
        user_id: users.userA.id,
        game_id: game.gameId,
        playthrough_number: 2,
        rating: 7,
        finished_on: "2026-04-01",
      },
    ],
    { onConflict: "user_id,game_id,playthrough_number" },
  );

  await page.goto("/perfil");
  await page.getByRole("link", { name: /con 3½ estrellas$/ }).click();
  await expect(page).toHaveURL(/\/perfil\/resenas\?rating=7$/);
  const title = testGameTitle("Histograma");
  await expect(page.getByTestId("own-review").filter({ hasText: title })).toHaveCount(1);

  // La primera partida (3) no cuenta: la reemplazó la rejugada.
  await page.goto("/perfil/resenas?rating=3");
  await expect(page.getByTestId("own-review").filter({ hasText: title })).toHaveCount(0);
});

test("PROF-16: 'Juegos jugados' no cuenta dos veces un juego platinado y reseñado", async ({
  page,
  supabase,
  users,
}) => {
  const game = await seedGameWithTrophies(supabase, users.userA.id, {
    n: 4,
    nameSuffix: "Jugado Dos Veces",
    np: 3202,
  });
  await unlockPlatinum(supabase, users.userA.id, game.gameId);
  await supabase
    .from("game_diary_entries")
    .upsert(
      {
        user_id: users.userA.id,
        game_id: game.gameId,
        playthrough_number: 1,
        rating: 8,
        finished_on: "2026-03-10",
      },
      { onConflict: "user_id,game_id,playthrough_number" },
    );

  await page.goto("/perfil/jugados");
  await expect(
    page.getByTestId("played-game").filter({ hasText: testGameTitle("Jugado Dos Veces") }),
  ).toHaveCount(1);
});

test("PROF-17: cada fila de Estadísticas lleva a su expandido", async ({ page }) => {
  const rows: [RegExp, RegExp, string][] = [
    [/^Juegos jugados/, /\/perfil\/jugados$/, "Juegos jugados"],
    [/^Platinos/, /\/perfil\/platinos$/, "Platinos"],
    [/^Reseñas/, /\/perfil\/resenas$/, "Tus reseñas"],
    [/^Likes/, /\/perfil\/likes$/, "Likes"],
    [/^Siguiendo/, /\/perfil\/siguiendo$/, "Siguiendo"],
    [/^Seguidores/, /\/perfil\/seguidores$/, "Seguidores"],
  ];
  for (const [label, url, heading] of rows) {
    await page.goto("/perfil");
    await page.getByTestId("profile-stats").getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("PROF-18: 'este año' no se corre por zona horaria", async () => {
  // Una columna `date` se corta como string: el 1 de enero es de ese año.
  expect(yearOfDate("2026-01-01")).toBe(2026);
  // Un platino de la noche del 31/12 en Argentina es 01/01 en UTC: cuenta en
  // el año viejo.
  expect(yearOfInstant("2026-01-01T02:00:00Z")).toBe(2025);
  expect(yearOfInstant("2026-01-01T04:00:00Z")).toBe(2026);

  const summary = summarizePlayed(
    [
      { gameId: "a", year: 2023 },
      { gameId: "a", year: 2026 },
      { gameId: "b", year: 2025 },
    ],
    2026,
  );
  expect(summary).toMatchObject({ total: 2, thisYear: 1 });
});

test("PROF-19: Platinos y 100% de Steam van separados", async ({ page, supabase, users }) => {
  const game = await seedGameWithTrophies(supabase, users.userA.id, {
    n: 1,
    nameSuffix: "Steam Completo",
    np: 3203,
  });
  await supabase.from("game_diary_entries").upsert(
    {
      user_id: users.userA.id,
      game_id: game.gameId,
      playthrough_number: 1,
      finished_on: "2026-03-11",
      completed_at: "2026-03-11T12:00:00Z",
      source: "completion_sync",
    },
    { onConflict: "user_id,game_id,playthrough_number" },
  );
  const title = testGameTitle("Steam Completo");

  await page.goto("/perfil");
  await expect(
    page.getByTestId("profile-stats").getByRole("link", { name: /^100% en Steam/ }),
  ).toBeVisible();

  await page.goto("/perfil/completados");
  await expect(page.getByTestId("completed-game").filter({ hasText: title })).toHaveCount(1);
  await page.goto("/perfil/platinos");
  await expect(page.getByTestId("platinum-game").filter({ hasText: title })).toHaveCount(0);
});

test("PROF-20: la bio se edita en Configuración y aparece en el perfil", async ({
  page,
  supabase,
  users,
}) => {
  await supabase.from("users").update({ bio: null }).eq("id", users.userA.id);
  const bio = "[E2E] Cazador de platinos";

  await page.goto("/configuracion/perfil");
  await page.getByLabel("Bio").fill(bio);
  await page.getByRole("button", { name: "Guardar bio" }).click();
  await expect(page.getByRole("status")).toHaveText("Bio guardada.");

  await page.goto("/perfil");
  await expect(page.getByTestId("profile-bio")).toHaveText(bio);

  await supabase.from("users").update({ bio: null }).eq("id", users.userA.id);
});
