import { test, expect } from "../fixtures/test";
import {
  STEAM_OPENID_STATE_COOKIE,
  isFreshResponseNonce,
  matchesOpenIdSession,
} from "../../lib/steam/openid-state";

/**
 * Fase 13: Steam como segunda plataforma (issues #110-#119).
 * Casos STEAM-01..12 de TESTING_PRD.md sección 6.14.
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

const STEAM_ID = "76561199000000001";

/**
 * Arranca el flujo de OpenID como lo haría el botón "Verificar con Steam" y
 * devuelve el `return_to` que la app le pasó a Steam (con su `state`). La
 * cookie del `state` queda en el contexto del navegador: `page.request` comparte
 * el mismo cookie jar. No se sigue el redirect: no se sale a steamcommunity.com.
 */
async function startOpenId(page: import("@playwright/test").Page): Promise<string> {
  const res = await page.request.get("/api/steam/openid", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const steamUrl = new URL(res.headers()["location"]);
  const returnTo = steamUrl.searchParams.get("openid.return_to");
  expect(returnTo).toContain("state=");
  return returnTo!;
}

/** La URL con la que Steam devolvería al usuario a `returnTo`. */
function openIdCallback(returnTo: string, sig: string, signedReturnTo = returnTo): string {
  const url = new URL(returnTo);
  url.searchParams.set("openid.mode", "id_res");
  url.searchParams.set("openid.claimed_id", `https://steamcommunity.com/openid/id/${STEAM_ID}`);
  url.searchParams.set("openid.return_to", signedReturnTo);
  url.searchParams.set("openid.response_nonce", `${new Date().toISOString().slice(0, 19)}Ze2e`);
  url.searchParams.set(
    "openid.signed",
    "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
  );
  url.searchParams.set("openid.sig", sig);
  return `${url.pathname}${url.search}`;
}

async function expectVerified(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  verified: boolean,
) {
  const { data } = await supabase
    .from("steam_accounts")
    .select("verified")
    .eq("user_id", userId)
    .single();
  expect(data?.verified).toBe(verified);
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
    await expect(page.getByRole("region", { name: "Steam" }).getByRole("alert")).toContainText(
      /No encontramos ese perfil de Steam/i,
    );
  });

  test("STEAM-04: conectar deja la cuenta como no verificada", async ({
    page,
    supabase,
    users,
  }) => {
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
      .in(
        "trophy_id",
        (trophies ?? []).map((trophy) => trophy.id),
      );
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
    //
    // Acotado a la grilla: desde #191 `/biblioteca` también tiene carruseles
    // arriba, y un juego empezado puede aparecer en "Seguí jugando" si otro
    // spec generó recomendaciones para userA en paralelo.
    await page.goto("/juegos");
    const library = page.getByRole("region", { name: "Tu biblioteca" });
    await expect(library.getByText("[E2E] Steam Game Con Logros")).toBeVisible();
    await expect(page.getByText("[E2E] Steam Game Sin Logros")).toHaveCount(0);
    // Las 2 horas del fixture se muestran en la tarjeta, mismo formato que PSN.
    const card = library.getByRole("listitem").filter({ hasText: "[E2E] Steam Game Con Logros" });
    await expect(card.getByText("2 h")).toBeVisible();
    await expect(card.locator('[data-icon="clock"]')).toBeVisible();
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
    const { data: trophies } = await supabase.from("trophies").select("id").eq("game_id", game!.id);
    await supabase.from("user_trophies").upsert(
      (trophies ?? []).map((trophy) => ({
        user_id: users.userA.id,
        trophy_id: trophy.id,
        unlocked_at: "2026-01-15T12:00:00.000Z",
      })),
      { onConflict: "user_id,trophy_id" },
    );

    await page.goto("/diario");
    // Desde #197 el import vive en el menú ⋮ del diario.
    await page.getByRole("button", { name: "Más acciones del diario" }).click();
    await page.getByRole("button", { name: /Importar mis platinos/i }).click();
    // El resultado del import es texto suelto, no un role=status: se busca por
    // texto para que un backfill que no encuentra nada falle acá y no tres
    // asserts más abajo con un array vacío sin explicación.
    // Se assertea sobre el contenedor y no sobre el texto exacto para que, si
    // el backfill no encuentra nada, el fallo muestre el mensaje que sí salió.
    await expect(page.locator("body")).toContainText(/Listo:/i);

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
    const returnTo = await startOpenId(page);
    await page.goto(openIdCallback(returnTo, "firma-falsificada"));
    await expect(page).toHaveURL(/steam=invalido/);
    await expectVerified(supabase, users.userA.id, false);
  });

  test("STEAM-10: una respuesta de OpenID válida marca la cuenta como verificada", async ({
    page,
    supabase,
    users,
  }) => {
    await connectSteam(page, VANITY_PUBLIC);

    const returnTo = await startOpenId(page);
    await page.goto(openIdCallback(returnTo, "e2e-firma-valida"));
    await expect(page).toHaveURL(/steam=verificada/);

    const steamCard = page.getByRole("region", { name: "Steam" });
    await expect(steamCard.getByText(/Cuenta verificada con Steam/i)).toBeVisible();
    await expectVerified(supabase, users.userA.id, true);
  });

  test("STEAM-12: una respuesta firmada que no arrancó esta sesión no conecta ni verifica", async ({
    page,
    supabase,
    users,
  }) => {
    // Sin cuenta previa: es el caso del ataque, donde la rama final conectaba
    // de cero la cuenta del atacante como verificada.
    const attackerUrl = new URL("/api/steam/openid", "http://localhost:3000");
    attackerUrl.searchParams.set("state", "state-del-atacante");
    const foreign = openIdCallback(attackerUrl.toString(), "e2e-firma-valida");

    // 1) Sin haber arrancado el flujo (no hay cookie de state).
    await page.goto(foreign);
    await expect(page).toHaveURL(/steam=invalido/);

    // 2) Con un flujo propio en curso, pero la URL de vuelta trae otro state.
    await startOpenId(page);
    await page.goto(foreign);
    await expect(page).toHaveURL(/steam=invalido/);

    // 3) El state propio en la URL, pero un return_to firmado que no lo lleva.
    const returnTo = await startOpenId(page);
    await page.goto(openIdCallback(returnTo, "e2e-firma-valida", attackerUrl.toString()));
    await expect(page).toHaveURL(/steam=invalido/);

    // 4) Sin la cookie (vencida, o ya usada: se borra al volver) no sirve.
    const once = await startOpenId(page);
    await page.context().clearCookies({ name: STEAM_OPENID_STATE_COOKIE });
    await page.goto(openIdCallback(once, "e2e-firma-valida"));
    await expect(page).toHaveURL(/steam=invalido/);

    const { data } = await supabase
      .from("steam_accounts")
      .select("user_id")
      .eq("user_id", users.userA.id)
      .maybeSingle();
    expect(data).toBeNull();
  });

  test("STEAM-13: un segundo sync manual antes de 10 minutos devuelve 429", async ({
    page,
    supabase,
    users,
  }) => {
    await connectSteam(page, VANITY_PUBLIC);
    // Un sync recién hecho, sin pasar por el mock de toda la biblioteca.
    await supabase
      .from("steam_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", users.userA.id);

    // El botón de la tarjeta queda deshabilitado y dice cuánto falta.
    await page.goto(CONNECTIONS);
    const steamCard = page.getByRole("region", { name: "Steam" });
    await expect(steamCard.getByRole("button", { name: "Sincronizar ahora" })).toBeDisabled();
    await expect(steamCard.getByText(/Podés volver a sincronizar en/)).toBeVisible();

    // Y la ruta lo rechaza aunque alguien se saltee el botón. Va al final, como
    // en SYNC-18: después de un request de `page.request` la navegación del
    // test volvía al login.
    const res = await page.request.post("/api/steam/sync");
    expect(res.status()).toBe(429);
    expect(Number(res.headers()["retry-after"])).toBeGreaterThan(0);
    expect((await res.json()).error).toMatch(/Ya sincronizaste hace poco/);
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

test.describe("Steam OpenID: atado a la sesión", () => {
  const origin = "https://platinoob.test";
  const now = Date.parse("2026-10-10T18:00:00Z");
  const params = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({
      state: "abc",
      "openid.return_to": `${origin}/api/steam/openid?state=abc`,
      "openid.response_nonce": "2026-10-10T17:58:00Zxyz",
      ...overrides,
    });

  test("STEAM-12: el state, el return_to y el nonce tienen que coincidir", () => {
    expect(matchesOpenIdSession(params(), "abc", origin, now)).toBe(true);
    expect(matchesOpenIdSession(params(), undefined, origin, now)).toBe(false);
    expect(matchesOpenIdSession(params(), "otro", origin, now)).toBe(false);
    expect(
      matchesOpenIdSession(
        params({ "openid.return_to": "https://evil.test/api/steam/openid?state=abc" }),
        "abc",
        origin,
        now,
      ),
    ).toBe(false);
    expect(
      matchesOpenIdSession(
        params({ "openid.return_to": `${origin}/api/steam/openid?state=otro` }),
        "abc",
        origin,
        now,
      ),
    ).toBe(false);
  });

  test("STEAM-12: un nonce viejo o del futuro se rechaza", () => {
    expect(isFreshResponseNonce("2026-10-10T17:58:00Zxyz", now)).toBe(true);
    expect(isFreshResponseNonce("2026-10-10T17:00:00Zxyz", now)).toBe(false);
    expect(isFreshResponseNonce("2026-10-10T18:30:00Zxyz", now)).toBe(false);
    expect(isFreshResponseNonce("basura", now)).toBe(false);
    expect(isFreshResponseNonce(null, now)).toBe(false);
  });
});
