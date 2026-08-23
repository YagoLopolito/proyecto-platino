import { test, expect } from "../fixtures/test";

/**
 * Fase 13: Steam como segunda plataforma (issues #110-#119).
 * Casos STEAM-01..10 de TESTING_PRD.md sección 6.14.
 *
 * Toda la Steam Web API está mockeada por `E2E_MOCKS=1` (lib/steam/mocks.ts):
 * no sale una sola request real, y los juegos que crea el sync se borran en el
 * teardown por su rango reservado de appid.
 */

const CONNECTIONS = "/configuracion/conexiones";
const VANITY_PUBLIC = "e2e-steam-user";
const VANITY_PRIVATE = "e2e-steam-private";

/**
 * Deja al usuario sin cuenta de Steam y sin los rastros del sync entre casos.
 *
 * Los juegos de `games` son catálogo compartido y los borra el teardown, pero
 * lo que cuelga del usuario (logros desbloqueados, entradas de diario) tiene que
 * limpiarse acá: en modo serial un test que falla reintenta todo el describe, y
 * sin esto el reintento arranca con el estado que dejó el intento anterior.
 */
test.afterEach(async ({ supabase, users }) => {
  await supabase.from("steam_accounts").delete().eq("user_id", users.userA.id);

  const { data: steamGames } = await supabase
    .from("games")
    .select("id")
    .gte("steam_appid", 999_000_000);
  const gameIds = (steamGames ?? []).map((game) => game.id);
  if (gameIds.length === 0) return;

  await supabase
    .from("game_diary_entries")
    .delete()
    .eq("user_id", users.userA.id)
    .in("game_id", gameIds);

  const { data: trophies } = await supabase.from("trophies").select("id").in("game_id", gameIds);
  const trophyIds = (trophies ?? []).map((trophy) => trophy.id);
  if (trophyIds.length > 0) {
    await supabase
      .from("user_trophies")
      .delete()
      .eq("user_id", users.userA.id)
      .in("trophy_id", trophyIds);
  }
});

/**
 * Conecta y espera a que la tarjeta quede en su estado conectado.
 *
 * Se espera el badge de estado y NO el mensaje de éxito del form: al conectar,
 * la Server Action hace `revalidatePath` y la tarjeta se vuelve a renderizar en
 * su rama "conectada", desmontando el form que mostraba ese mensaje. El badge
 * es lo que el usuario efectivamente ve al final, y no depende de ese timing.
 */
async function submitSteamForm(page: import("@playwright/test").Page, vanity: string) {
  await page.goto(CONNECTIONS);
  await page.getByLabel(/SteamID64 o URL del perfil/i).fill(vanity);
  await page.getByRole("button", { name: /Conectar cuenta de Steam/i }).click();
}

async function connectSteam(
  page: import("@playwright/test").Page,
  vanity: string,
  expectedStatus: "connected" | "attention" = "connected",
) {
  await submitSteamForm(page, vanity);

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
    await submitSteamForm(page, "no-existe-este-perfil-e2e");
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
      .select("id, type, icon_url")
      .eq("game_id", withAchievements!.id);
    expect(trophies).toHaveLength(2);
    expect(trophies?.every((trophy) => trophy.type === "achievement")).toBe(true);

    // El ícono queda con el host moderno, que es el único whitelisteado en
    // next.config.ts: con el que devuelve Steam, next/image no lo renderiza.
    const withIcon = trophies?.find((trophy) => trophy.icon_url !== null);
    expect(withIcon?.icon_url).toContain("cdn.cloudflare.steamstatic.com");

    const { data: unlocked } = await supabase
      .from("user_trophies")
      .select("trophy_id")
      .eq("user_id", users.userA.id)
      .in("trophy_id", (trophies ?? []).map((trophy) => trophy.id));
    expect(unlocked).toHaveLength(1);

    // El playtime queda guardado: es lo que separa un juego real de un
    // free-to-play reclamado y nunca abierto.
    const { data: userGame } = await supabase
      .from("user_games")
      .select("playtime_minutes")
      .eq("user_id", users.userA.id)
      .eq("game_id", withAchievements!.id)
      .single();
    expect(userGame?.playtime_minutes).toBe(120);

    // La biblioteca muestra el juego jugado, sin desglose por tipo de trofeo, y
    // esconde el que tiene 0 horas y 0 logros (demos, playtests, free-to-play
    // reclamados y nunca abiertos).
    await page.goto("/juegos");
    await expect(page.getByText("[E2E] Steam Game Con Logros")).toBeVisible();
    await expect(page.getByText("[E2E] Steam Game Sin Logros")).toHaveCount(0);
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

  test("STEAM-08: un juego al 100% crea su entrada de diario, sin tocar el platino", async ({
    page,
    supabase,
    users,
  }) => {
    await connectSteam(page, VANITY_PUBLIC);
    const steamCard = page.getByRole("region", { name: "Steam" });
    await steamCard.getByRole("button", { name: /Sincronizar ahora/i }).click();
    await expect(steamCard.getByRole("status")).toContainText(/Sincronizado/i);

    // El juego mockeado tiene 1 de 2 logros: NO está al 100%, así que no
    // debería haber entrada de diario todavía.
    const { data: sinCompletar } = await supabase
      .from("game_diary_entries")
      .select("id")
      .eq("user_id", users.userA.id)
      .eq("source", "completion_sync");
    expect(sinCompletar).toHaveLength(0);

    // Se desbloquea el logro que faltaba y se vuelve a sincronizar.
    const { data: game } = await supabase
      .from("games")
      .select("id")
      .eq("steam_appid", 999_000_001)
      .single();
    const { data: trophies } = await supabase
      .from("trophies")
      .select("id")
      .eq("game_id", game!.id);
    await supabase.from("user_trophies").upsert(
      (trophies ?? []).map((trophy) => ({
        user_id: users.userA.id,
        trophy_id: trophy.id,
        unlocked_at: "2026-01-15T12:00:00.000Z",
      })),
      { onConflict: "user_id,trophy_id" },
    );

    await page.goto("/diario");
    await page.getByRole("button", { name: /Importar mis platinos/i }).click();
    // El resultado del import es texto suelto, no un role=status: se busca por
    // texto para que un backfill que no encuentra nada falle acá y no tres
    // asserts más abajo con un array vacío sin explicación.
    await expect(page.getByText(/Listo:/i)).toBeVisible();

    const { data: entries } = await supabase
      .from("game_diary_entries")
      .select("completed_at, platinum_earned_at, source, finished_on")
      .eq("user_id", users.userA.id)
      .eq("game_id", game!.id);

    expect(entries).toHaveLength(1);
    expect(entries![0].source).toBe("completion_sync");
    expect(entries![0].completed_at).not.toBeNull();
    // El 100% de Steam NUNCA escribe el campo del platino de PSN.
    expect(entries![0].platinum_earned_at).toBeNull();
    // La fecha es la del último logro, no la del sync.
    expect(entries![0].finished_on).toBe("2026-01-15");
  });

  test("STEAM-09: una respuesta de OpenID falsificada no verifica la cuenta", async ({
    page,
    supabase,
    users,
  }) => {
    await connectSteam(page, VANITY_PUBLIC);

    // Los parámetros de la URL de vuelta los puede escribir cualquiera: sin la
    // revalidación contra Steam, esto alcanzaría para marcarse como verificado.
    await page.goto(
      "/api/steam/openid?openid.mode=id_res" +
        "&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561199000000001" +
        "&openid.sig=firma-falsificada",
    );
    await expect(page).toHaveURL(/steam=invalido/);

    const { data } = await supabase
      .from("steam_accounts")
      .select("verified")
      .eq("user_id", users.userA.id)
      .single();
    expect(data?.verified).toBe(false);
  });

  test("STEAM-10: una respuesta de OpenID válida marca la cuenta como verificada", async ({
    page,
    supabase,
    users,
  }) => {
    await connectSteam(page, VANITY_PUBLIC);

    await page.goto(
      "/api/steam/openid?openid.mode=id_res" +
        "&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561199000000001" +
        "&openid.sig=e2e-firma-valida",
    );
    await expect(page).toHaveURL(/steam=verificada/);

    const steamCard = page.getByRole("region", { name: "Steam" });
    await expect(steamCard.getByText(/Cuenta verificada con Steam/i)).toBeVisible();

    const { data } = await supabase
      .from("steam_accounts")
      .select("verified")
      .eq("user_id", users.userA.id)
      .single();
    expect(data?.verified).toBe(true);
  });

  test("STEAM-11: el filtro de fuente solo aparece con las dos cuentas conectadas", async ({
    page,
    supabase,
    users,
  }) => {
    await connectSteam(page, VANITY_PUBLIC);

    // Con una sola plataforma el selector es ruido: dos de los tres botones
    // darían vacío siempre.
    await page.goto("/juegos");
    await expect(page.getByRole("navigation", { name: /Filtrar por plataforma/i })).toHaveCount(0);

    await supabase.from("psn_accounts").insert({
      user_id: users.userA.id,
      online_id: "[E2E] PSN",
      account_id: "e2e-account",
      npsso_encrypted: "e2e",
    });

    await page.goto("/juegos");
    const filtro = page.getByRole("navigation", { name: /Filtrar por plataforma/i });
    await expect(filtro).toBeVisible();

    // Un valor inválido cae a "Todos" en vez de romper.
    await page.goto("/juegos?fuente=nintendo");
    await expect(page.getByRole("link", { name: "Todos", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await supabase.from("psn_accounts").delete().eq("user_id", users.userA.id);
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
