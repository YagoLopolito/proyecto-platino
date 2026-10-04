import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import { showsSettingsGear } from "@/app/(app)/nav-links";

/**
 * Perfil › Diario / Listas / Playlist y perfil ajeno (epic #183, issue #197).
 * Casos DIARY-20/21 (§6.8) y PROF-21/22 (§6.10) de TESTING_PRD.md. El issue
 * numeraba el perfil ajeno como PROF-20/21, pero PROF-20 ya era la bio (#196).
 *
 * El diario de userA lo escriben otros specs en paralelo: acá todo se acota a
 * un año que nadie más usa (`?anio=2011`).
 */
test.describe.configure({ mode: "serial" });

const YEAR = "2011";

async function seedDiaryEntry(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
  finishedOn: string,
  rating: number | null,
) {
  await supabase.from("game_diary_entries").upsert(
    {
      user_id: userId,
      game_id: gameId,
      playthrough_number: 1,
      rating,
      review: null,
      finished_on: finishedOn,
    },
    { onConflict: "user_id,game_id,playthrough_number" },
  );
}

async function seedList(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  visibility: "public" | "private",
  gameId: string,
) {
  await supabase.from("user_lists").delete().eq("user_id", userId).eq("title", title);
  const { data: list, error } = await supabase
    .from("user_lists")
    .insert({ user_id: userId, title, visibility, is_ranked: false })
    .select("id")
    .single();
  if (error || !list) throw new Error(`No se pudo seedear la lista: ${error?.message}`);
  await supabase.from("user_list_items").insert({ list_id: list.id, game_id: gameId, position: 1 });
}

test.describe("Perfil › Diario", () => {
  test.beforeAll(async ({ supabase, users }) => {
    const [early, late, january] = await Promise.all([
      seedGameWithTrophies(supabase, users.userA.id, {
        n: 1,
        nameSuffix: "Diario Día 5",
        np: 3301,
      }),
      seedGameWithTrophies(supabase, users.userA.id, {
        n: 1,
        nameSuffix: "Diario Día 21",
        np: 3302,
      }),
      seedGameWithTrophies(supabase, users.userA.id, {
        n: 1,
        nameSuffix: "Diario Enero",
        np: 3303,
      }),
    ]);
    await Promise.all([
      seedDiaryEntry(supabase, users.userA.id, early.gameId, `${YEAR}-03-05`, 4),
      seedDiaryEntry(supabase, users.userA.id, late.gameId, `${YEAR}-03-21`, 9),
      seedDiaryEntry(supabase, users.userA.id, january.gameId, `${YEAR}-01-10`, null),
    ]);
  });

  test("DIARY-20: agrupado por mes con cabecera pegajosa, día en el recuadro, más nuevo primero", async ({
    page,
  }) => {
    await page.goto(`/perfil/diario?anio=${YEAR}`);

    const months = page.getByTestId("diary-month");
    await expect(months).toHaveCount(2);
    await expect(months.nth(0).getByRole("heading")).toHaveText(`Marzo ${YEAR}`);
    await expect(months.nth(1).getByRole("heading")).toHaveText(`Enero ${YEAR}`);
    await expect(months.nth(0).getByRole("heading")).toHaveCSS("position", "sticky");

    const march = months.nth(0).getByTestId("diary-entry");
    await expect(march).toHaveCount(2);
    await expect(march.nth(0).getByTestId("diary-day")).toHaveText("21");
    await expect(march.nth(0)).toContainText(testGameTitle("Diario Día 21"));
    await expect(march.nth(1).getByTestId("diary-day")).toHaveText("5");

    // La fila abre la ficha del juego con la entrada enfocada.
    await expect(march.nth(0).getByRole("link")).toHaveAttribute("href", /\?resena=.+#resena-/);
  });

  test("DIARY-21: los filtros de año y rating acotan el diario", async ({ page }) => {
    await page.goto("/perfil/diario");
    await page.getByLabel("Filtrar por año").selectOption(YEAR);
    await expect(page.getByTestId("diary-entry")).toHaveCount(3);

    await page.getByLabel("Filtrar por rating").selectOption("8");
    await expect(page.getByTestId("diary-entry")).toHaveCount(1);
    await expect(page.getByTestId("diary-entry")).toContainText(testGameTitle("Diario Día 21"));
    await expect(page).toHaveURL(new RegExp(`anio=${YEAR}`));

    await page.getByLabel("Filtrar por rating").selectOption("none");
    await expect(page.getByTestId("diary-entry")).toHaveCount(1);
    await expect(page.getByTestId("diary-entry")).toContainText(testGameTitle("Diario Enero"));
  });
});

test.describe("Perfil ajeno", () => {
  test("PROF-21: el perfil de otro usuario tiene las mismas tabs, sin engranaje ni datos privados", async ({
    page,
    users,
  }) => {
    const base = `/perfil/${users.userB.id}`;
    await page.goto(base);

    const tabs = page.getByRole("tablist", { name: /^Perfil de / }).getByRole("tab");
    await expect(tabs).toHaveText(["Perfil", "Diario", "Listas", "Playlist", "Galería"]);
    expect(showsSettingsGear(base)).toBe(false);
    expect(showsSettingsGear(`${base}/diario`)).toBe(false);

    // Sin editores y con Seguir / Siguiendo en la cabecera.
    await expect(page.getByRole("button", { name: /^(Seguir|Siguiendo)$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);

    // Lo público se aclara; nada que salga de user_trophies (sin "100% en
    // Steam", sin "Likes", sin seguidores).
    const stats = page.getByTestId("profile-stats");
    await expect(stats).toContainText("según su diario");
    await expect(stats).not.toContainText("100% en Steam");
    await expect(stats).not.toContainText("Seguidores");

    await tabs.nth(1).click();
    await expect(page).toHaveURL(`${base}/diario`);
    await expect(page.getByRole("heading", { level: 1, name: /^Diario de / })).toBeVisible();
  });

  test("PROF-22: una lista privada no aparece en el perfil ajeno", async ({
    page,
    supabase,
    users,
  }) => {
    const game = await seedGameWithTrophies(supabase, users.userB.id, {
      n: 1,
      nameSuffix: "Listas Perfil Ajeno",
      np: 3304,
    });
    await seedList(supabase, users.userB.id, "[E2E] Lista pública de B", "public", game.gameId);
    await seedList(supabase, users.userB.id, "[E2E] Lista privada de B", "private", game.gameId);

    await page.goto(`/perfil/${users.userB.id}/listas`);
    const lists = page.getByTestId("profile-list");
    await expect(lists.filter({ hasText: "[E2E] Lista pública de B" })).toHaveCount(1);
    await expect(page.getByText("[E2E] Lista privada de B")).toHaveCount(0);
  });

  test("PROF-22b: en tus listas, la privada aparece con candado", async ({
    page,
    supabase,
    users,
  }) => {
    const game = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Listas Propias Candado",
      np: 3305,
    });
    await seedList(supabase, users.userA.id, "[E2E] Mi lista privada", "private", game.gameId);

    await page.goto("/perfil/listas");
    const row = page.getByTestId("profile-list").filter({ hasText: "[E2E] Mi lista privada" });
    await expect(row.getByRole("img", { name: "Privada" })).toBeVisible();
  });
});
