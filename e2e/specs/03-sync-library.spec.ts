import { test, expect } from "../fixtures/test";
import { encryptNpssoForFixture } from "../helpers/psn";
import { E2E_PSN_MOCK_PREFIX } from "../helpers/ids";
import { seedGameWithTrophies } from "../helpers/seed";
import { createTestUserClient } from "../helpers/supabase";

/**
 * Sync y biblioteca (`/juegos`, `POST /api/psn/sync`, `GET /api/cron/sync`).
 * Casos SYNC-01, SYNC-03, SYNC-04, SYNC-06, SYNC-11 de TESTING_PRD.md §6.3
 * (los P0). El fixture mockeado (`lib/psn/mocks.ts`, `E2E_MOCKS=1`) trae 3
 * juegos `[E2E]` con ~12 trofeos, uno de ellos platinado al 100%.
 *
 * Todos tocan la misma fila `psn_accounts`: corren en serie dentro de este
 * archivo y cada uno la deja limpia al final. Va sobre **userB**, no userA:
 * `02-psn-connect` y `13-steam` también escriben esa fila para userA y corren
 * en paralelo en el otro worker, así que compartir usuario hacía que la
 * tarjeta de PSN apareciera ya conectada y el form de NPSSO quedara oculto.
 * Por eso este archivo tiene su propio proyecto (`authed-b`) en
 * `playwright.config.ts`, con la storageState de userB.
 */
const CONNECTIONS = "/configuracion/conexiones";
const MOCK_VALID_NPSSO = "E2E-VALID-NPSSO";

test.describe.configure({ mode: "serial" });

test.describe("Sync y biblioteca", () => {
  test.afterEach(async ({ supabase, users }) => {
    await supabase.from("psn_accounts").delete().eq("user_id", users.userB.id);
  });

  test("SYNC-01: sync manual trae los 3 juegos [E2E] a la biblioteca", async ({ page }) => {
    await page.goto(CONNECTIONS);
    const psnCard = page.getByRole("region", { name: "PlayStation Network" });
    await psnCard.getByLabel("NPSSO").fill(MOCK_VALID_NPSSO);
    await psnCard.getByRole("button", { name: /Conectar cuenta PSN/i }).click();
    await expect(psnCard.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      "connected",
    );

    await psnCard.getByRole("button", { name: /Sincronizar ahora/i }).click();
    await expect(psnCard.getByText(/Sincronizado: 3 juegos/i)).toBeVisible();

    await page.goto("/juegos");
    await expect(page.getByText("[E2E] PSN Game Uno")).toBeVisible();
    await expect(page.getByText("[E2E] PSN Game Dos")).toBeVisible();
    await expect(page.getByText("[E2E] PSN Game Tres")).toBeVisible();
  });

  test("SYNC-03: sync con NPSSO vencido muestra error y marca la cuenta como expired", async ({
    page,
    supabase,
    users,
  }) => {
    await supabase.from("psn_accounts").insert({
      user_id: users.userB.id,
      online_id: "[E2E] Vencido",
      account_id: "e2e-account-vencido",
      npsso_encrypted: encryptNpssoForFixture("E2E-EXPIRED-NPSSO"),
      token_status: "valid",
    });

    await page.goto(CONNECTIONS);
    const psnCard = page.getByRole("region", { name: "PlayStation Network" });
    await psnCard.getByRole("button", { name: /Sincronizar ahora/i }).click();

    await expect(psnCard.getByText(/expiró/i)).toBeVisible();

    const { data } = await supabase
      .from("psn_accounts")
      .select("token_status")
      .eq("user_id", users.userB.id)
      .single();
    expect(data?.token_status).toBe("expired");
  });

  test("SYNC-04: sincronizar dos veces no duplica juegos ni trofeos", async ({
    page,
    supabase,
  }) => {
    await page.goto(CONNECTIONS);
    const psnCard = page.getByRole("region", { name: "PlayStation Network" });
    await psnCard.getByLabel("NPSSO").fill(MOCK_VALID_NPSSO);
    await psnCard.getByRole("button", { name: /Conectar cuenta PSN/i }).click();
    await expect(psnCard.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      "connected",
    );

    await psnCard.getByRole("button", { name: /Sincronizar ahora/i }).click();
    await expect(psnCard.getByText(/Sincronizado: 3 juegos/i)).toBeVisible();

    await psnCard.getByRole("button", { name: /Sincronizar ahora/i }).click();
    await expect(psnCard.getByText(/Sincronizado: 3 juegos/i)).toBeVisible();

    // Acotado al prefijo del mock de PSN, no a `E2E-%`: ese prefijo genérico
    // también matchea los juegos que seedean 04/05/07, que corren en paralelo
    // en el otro worker, y hacía fallar el conteo según quién ganara la carrera.
    const { data: games } = await supabase
      .from("games")
      .select("id")
      .like("np_comm_id", `${E2E_PSN_MOCK_PREFIX}%`);
    expect(games).toHaveLength(3);

    const gameIds = (games ?? []).map((g) => g.id);
    const { data: trophies } = await supabase
      .from("trophies")
      .select("id, game_id, trophy_id")
      .in("game_id", gameIds);
    // 5 + 4 + 3 trofeos del fixture, sin duplicados por el segundo sync.
    expect(trophies).toHaveLength(12);
  });

  test("SYNC-06: el conteo por tipo de trofeo coincide con el fixture", async ({
    page,
    supabase,
    users,
  }) => {
    await page.goto(CONNECTIONS);
    const psnCard = page.getByRole("region", { name: "PlayStation Network" });
    await psnCard.getByLabel("NPSSO").fill(MOCK_VALID_NPSSO);
    await psnCard.getByRole("button", { name: /Conectar cuenta PSN/i }).click();
    await expect(psnCard.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      "connected",
    );
    await psnCard.getByRole("button", { name: /Sincronizar ahora/i }).click();
    await expect(psnCard.getByText(/Sincronizado: 3 juegos/i)).toBeVisible();

    // Mismo acotado que SYNC-04: `E2E-%` a secas se lleva los juegos de los
    // otros specs y los conteos por tipo dejan de coincidir con el fixture.
    const { data: games } = await supabase
      .from("games")
      .select("id")
      .like("np_comm_id", `${E2E_PSN_MOCK_PREFIX}%`);
    const gameIds = (games ?? []).map((g) => g.id);
    const { data: trophies } = await supabase
      .from("trophies")
      .select("type")
      .in("game_id", gameIds);

    const counts = { bronze: 0, silver: 0, gold: 0, platinum: 0 } as Record<string, number>;
    for (const t of trophies ?? []) counts[t.type] = (counts[t.type] ?? 0) + 1;

    // Juego 1: 2 bronce, 1 plata, 1 oro, 1 platino. Juego 2: 2 bronce, 1
    // plata, 1 oro. Juego 3: 1 bronce, 1 plata, 1 oro.
    expect(counts.bronze).toBe(5);
    expect(counts.silver).toBe(3);
    expect(counts.gold).toBe(3);
    expect(counts.platinum).toBe(1);

    const { data: unlocked } = await supabase
      .from("user_trophies")
      .select("trophy_id")
      .eq("user_id", users.userB.id)
      .in(
        "trophy_id",
        (await supabase.from("trophies").select("id").in("game_id", gameIds)).data?.map(
          (t) => t.id,
        ) ?? [],
      );
    // Juego 1: 5 obtenidos. Juego 2: 1 obtenido. Juego 3: 0. Total 6.
    expect(unlocked).toHaveLength(6);
  });

  test("SYNC-13: las horas jugadas de PSN se guardan y se muestran en la tarjeta y en el diario", async ({
    page,
    supabase,
    users,
  }) => {
    await page.goto(CONNECTIONS);
    const psnCard = page.getByRole("region", { name: "PlayStation Network" });
    await psnCard.getByLabel("NPSSO").fill(MOCK_VALID_NPSSO);
    await psnCard.getByRole("button", { name: /Conectar cuenta PSN/i }).click();
    await expect(psnCard.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      "connected",
    );
    await psnCard.getByRole("button", { name: /Sincronizar ahora/i }).click();
    await expect(psnCard.getByText(/Sincronizado: 3 juegos/i)).toBeVisible();

    // El fixture reporta horas solo para "PSN Game Uno" (754 minutos): el
    // segundo juego cubre el caso "PSN no reportó horas", que con títulos
    // viejos es lo normal.
    const { data: game } = await supabase
      .from("games")
      .select("id")
      .eq("np_comm_id", `${E2E_PSN_MOCK_PREFIX}1`)
      .single();
    const gameId = game?.id as string;

    const { data: userGame } = await supabase
      .from("user_games")
      .select("playtime_minutes")
      .eq("user_id", users.userB.id)
      .eq("game_id", gameId)
      .single();
    expect(userGame?.playtime_minutes).toBe(754);

    await page.goto("/juegos");
    const card = page.getByRole("listitem").filter({ hasText: "[E2E] PSN Game Uno" });
    // El ⏱ que acompañaba a las horas pasó a ser un ícono del set (fase 3 del
    // issue #176), así que lo que se busca es el número y el ícono, no el emoji.
    await expect(card.getByText("13 h")).toBeVisible();
    await expect(card.locator('[data-icon="clock"]')).toBeVisible();
    // Sin horas reportadas no se muestra nada, ni un "0 h".
    const cardSinHoras = page.getByRole("listitem").filter({ hasText: "[E2E] PSN Game Dos" });
    await expect(cardSinHoras.locator('[data-icon="clock"]')).toHaveCount(0);

    // Las horas van en el hero de la ficha unificada (issue #186).
    await page.goto(`/juegos/${gameId}`);
    await expect(page.getByText("13 h jugadas")).toBeVisible();
  });

  test("SYNC-16: el usuario puede actualizar su propia fila de user_games", async ({
    supabase,
    users,
  }) => {
    // El sync escribe con upsert: la primera vez entra por el INSERT, y de ahí
    // en adelante por el ON CONFLICT DO UPDATE. `user_games` no tenía policy de
    // update, así que ese segundo camino lo rechazaba la RLS y las horas y el
    // last_played_at quedaban congelados en el valor del primer sync -- en la
    // biblioteca real del usuario, 3 juegos con horas sobre 368. Va con la anon
    // key logueada, no con service role: con service role la RLS ni se evalúa y
    // el permiso faltante no se ve.
    const { gameId } = await seedGameWithTrophies(supabase, users.userB.id, {
      n: 1,
      nameSuffix: "RLS User Games",
      np: 316,
    });
    const asUser = await createTestUserClient(users.userB.email, users.userB.password);

    await asUser
      .from("user_games")
      .upsert(
        { user_id: users.userB.id, game_id: gameId, playtime_minutes: 100 },
        { onConflict: "user_id,game_id" },
      );

    // El segundo upsert es el que importa: la fila ya existe.
    const { error } = await asUser
      .from("user_games")
      .upsert(
        { user_id: users.userB.id, game_id: gameId, playtime_minutes: 250 },
        { onConflict: "user_id,game_id" },
      );
    expect(error).toBeNull();

    const { data: row } = await supabase
      .from("user_games")
      .select("playtime_minutes")
      .eq("user_id", users.userB.id)
      .eq("game_id", gameId)
      .single();
    expect(row?.playtime_minutes).toBe(250);
  });

  test("SYNC-11: /api/cron/sync sin CRON_SECRET responde 401", async ({ request }) => {
    const response = await request.get("/api/cron/sync");
    expect(response.status()).toBe(401);
  });
});
