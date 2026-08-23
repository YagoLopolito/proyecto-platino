import { test, expect } from "../fixtures/test";
import { encryptNpssoForFixture } from "../helpers/psn";

/**
 * Sync y biblioteca (`/juegos`, `POST /api/psn/sync`, `GET /api/cron/sync`).
 * Casos SYNC-01, SYNC-03, SYNC-04, SYNC-06, SYNC-11 de TESTING_PRD.md §6.3
 * (los P0). El fixture mockeado (`lib/psn/mocks.ts`, `E2E_MOCKS=1`) trae 3
 * juegos `[E2E]` con ~12 trofeos, uno de ellos platinado al 100%.
 *
 * Todos tocan la misma fila `psn_accounts` de userA: corren en serie dentro
 * de este archivo y cada uno la deja limpia al final.
 */
const CONNECTIONS = "/configuracion/conexiones";
const MOCK_VALID_NPSSO = "E2E-VALID-NPSSO";

test.describe.configure({ mode: "serial" });

test.describe("Sync y biblioteca", () => {
  test.afterEach(async ({ supabase, users }) => {
    await supabase.from("psn_accounts").delete().eq("user_id", users.userA.id);
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
      user_id: users.userA.id,
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
      .eq("user_id", users.userA.id)
      .single();
    expect(data?.token_status).toBe("expired");
  });

  test("SYNC-04: sincronizar dos veces no duplica juegos ni trofeos", async ({ page, supabase }) => {
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

    const { data: games } = await supabase.from("games").select("id").like("np_comm_id", "E2E-%");
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

    const { data: games } = await supabase.from("games").select("id").like("np_comm_id", "E2E-%");
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
      .eq("user_id", users.userA.id)
      .in(
        "trophy_id",
        (
          await supabase.from("trophies").select("id").in("game_id", gameIds)
        ).data?.map((t) => t.id) ?? [],
      );
    // Juego 1: 5 obtenidos. Juego 2: 1 obtenido. Juego 3: 0. Total 6.
    expect(unlocked).toHaveLength(6);
  });

  test("SYNC-11: /api/cron/sync sin CRON_SECRET responde 401", async ({ request }) => {
    const response = await request.get("/api/cron/sync");
    expect(response.status()).toBe(401);
  });
});
