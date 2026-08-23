import { test, expect } from "../fixtures/test";

/**
 * Fase 13: conexión con Steam y sync de logros (issues #110-#114).
 * Casos STEAM-01..07 de TESTING_PRD.md sección 6.14.
 *
 * Toda la Steam Web API está mockeada por `E2E_MOCKS=1` (lib/steam/mocks.ts):
 * no sale una sola request real, y los juegos que crea el sync se borran en el
 * teardown por su rango reservado de appid.
 */

const CONNECTIONS = "/configuracion/conexiones";
const VANITY_PUBLIC = "e2e-steam-user";
const VANITY_PRIVATE = "e2e-steam-private";

/** Deja la cuenta de Steam desconectada al terminar cada caso. */
test.afterEach(async ({ supabase, users }) => {
  await supabase.from("steam_accounts").delete().eq("user_id", users.userA.id);
});

/**
 * Conecta y espera a que la tarjeta quede en su estado conectado.
 *
 * Se espera el badge de estado y NO el mensaje de éxito del form: al conectar,
 * la Server Action hace `revalidatePath` y la tarjeta se vuelve a renderizar en
 * su rama "conectada", desmontando el form que mostraba ese mensaje. El badge
 * es lo que el usuario efectivamente ve al final, y no depende de ese timing.
 */
async function connectSteam(
  page: import("@playwright/test").Page,
  vanity: string,
  expectedStatus: "connected" | "attention" = "connected",
) {
  await page.goto(CONNECTIONS);
  await page.getByLabel(/SteamID64 o URL del perfil/i).fill(vanity);
  await page.getByRole("button", { name: /Conectar cuenta de Steam/i }).click();

  await expect(
    page.getByRole("region", { name: "Steam" }).getByTestId("connection-status"),
  ).toHaveAttribute("data-status", expectedStatus);
}

// Todos comparten el mismo usuario y el mismo catálogo de juegos de Steam
// (games es catálogo compartido, no user-scoped), así que corren en serie: en
// paralelo se pisarían entre ellos, no porque el código falle.
test.describe.configure({ mode: "serial" });

test.describe("Steam", () => {
  test("STEAM-01: /psn redirige a Configuración › Conexiones", async ({ page }) => {
    await page.goto("/psn");
    await expect(page).toHaveURL(new RegExp(`${CONNECTIONS}$`));
    await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
  });

  test("STEAM-02: /configuracion muestra una tarjeta por plataforma", async ({ page }) => {
    await page.goto("/configuracion");
    await expect(page).toHaveURL(new RegExp(`${CONNECTIONS}$`));
    await expect(page.getByRole("region", { name: "PlayStation Network" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Steam" })).toBeVisible();
  });

  test("STEAM-03: conectar con un SteamID inexistente da un mensaje claro", async ({ page }) => {
    await connectSteam(page, "no-existe-este-perfil-e2e");
    await expect(
      page.getByRole("region", { name: "Steam" }).getByRole("alert"),
    ).toContainText(/No encontramos ese perfil de Steam/i);
  });

  test("STEAM-04: conectar deja la cuenta como no verificada", async ({ page, supabase, users }) => {
    await connectSteam(page, VANITY_PUBLIC);
    const steamCard = page.getByRole("region", { name: "Steam" });
    await expect(steamCard).toContainText("[E2E] Steam User");
    await expect(steamCard.getByText(/Cuenta no verificada/i)).toBeVisible();

    const { data } = await supabase
      .from("steam_accounts")
      .select("verified, profile_visibility")
      .eq("user_id", users.userA.id)
      .single();
    expect(data?.verified).toBe(false);
    expect(data?.profile_visibility).toBe("public");
  });

  test("STEAM-05: el sync trae juegos y logros con type 'achievement'", async ({
    page,
    supabase,
    users,
  }) => {
    await connectSteam(page, VANITY_PUBLIC);
    const steamCard = page.getByRole("region", { name: "Steam" });
    await steamCard.getByRole("button", { name: /Sincronizar ahora/i }).click();
    await expect(steamCard.getByRole("status")).toContainText(/Sincronizado: 2 juegos/i);

    const { data: games } = await supabase
      .from("games")
      .select("id, name, source, steam_appid, steam_has_achievements")
      .gte("steam_appid", 999_000_000);
    expect(games).toHaveLength(2);
    expect(games?.every((game) => game.source === "steam")).toBe(true);
    // El juego sin logros queda marcado para no volver a pedirle el schema.
    expect(games?.some((game) => game.steam_has_achievements === false)).toBe(true);

    const withAchievements = games?.find((game) => game.steam_has_achievements === true);
    const { data: trophies } = await supabase
      .from("trophies")
      .select("id, type")
      .eq("game_id", withAchievements!.id);
    expect(trophies).toHaveLength(2);
    expect(trophies?.every((trophy) => trophy.type === "achievement")).toBe(true);

    const { data: unlocked } = await supabase
      .from("user_trophies")
      .select("trophy_id")
      .eq("user_id", users.userA.id)
      .in("trophy_id", (trophies ?? []).map((trophy) => trophy.id));
    expect(unlocked).toHaveLength(1);

    // La biblioteca los muestra sin desglose por tipo de trofeo.
    await page.goto("/juegos");
    await expect(page.getByText("[E2E] Steam Game Con Logros")).toBeVisible();
  });

  test("STEAM-06: un perfil en privado se guarda y explica cómo destrabarlo", async ({
    page,
    supabase,
    users,
  }) => {
    // La cuenta queda conectada igual, en estado "necesita atención": si no se
    // guardara, el usuario no tendría dónde ver el problema ni cómo arreglarlo.
    await connectSteam(page, VANITY_PRIVATE, "attention");
    const steamCard = page.getByRole("region", { name: "Steam" });
    await expect(steamCard.getByText(/Detalles del juego/i).first()).toBeVisible();

    await steamCard.getByRole("button", { name: /Sincronizar ahora/i }).click();
    await expect(steamCard.getByRole("alert")).toContainText(/en privado/i);

    const { data } = await supabase
      .from("steam_accounts")
      .select("profile_visibility")
      .eq("user_id", users.userA.id)
      .single();
    expect(data?.profile_visibility).toBe("private");
  });

  test("STEAM-07: desconectar borra la cuenta y deja los juegos", async ({
    page,
    supabase,
    users,
  }) => {
    await connectSteam(page, VANITY_PUBLIC);

    page.on("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("region", { name: "Steam" })
      .getByRole("button", { name: /Desconectar cuenta de Steam/i })
      .click();

    await expect(
      page.getByRole("region", { name: "Steam" }).getByTestId("connection-status"),
    ).toHaveAttribute("data-status", "disconnected");

    const { data } = await supabase
      .from("steam_accounts")
      .select("id")
      .eq("user_id", users.userA.id);
    expect(data).toHaveLength(0);
  });
});
