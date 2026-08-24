import { test, expect } from "../fixtures/test";

/**
 * Conexión PSN (`app/(app)/configuracion/conexiones/`). Casos PSN-03, PSN-04,
 * PSN-06 de TESTING_PRD.md sección 6.2 -- los P0. El resto del NPSSO real
 * (`@live`) no corre en CI (R1, Sony bloquea el intercambio desde IPs de
 * datacenter).
 *
 * Todos los tests tocan la misma fila `psn_accounts` de userA: corren en
 * serie dentro de este archivo y cada uno la deja limpia al final.
 */
const CONNECTIONS = "/configuracion/conexiones";
const MOCK_VALID_NPSSO = "E2E-VALID-NPSSO";
const MOCK_EXPIRED_NPSSO = "E2E-EXPIRED-NPSSO";

test.describe.configure({ mode: "serial" });

test.describe("Conexión PSN", () => {
  test.afterEach(async ({ supabase, users }) => {
    await supabase.from("psn_accounts").delete().eq("user_id", users.userA.id);
  });

  test("PSN-03: NPSSO válido conecta la cuenta", async ({ page, supabase, users }) => {
    await page.goto(CONNECTIONS);
    const psnCard = page.getByRole("region", { name: "PlayStation Network" });
    await psnCard.getByLabel("NPSSO").fill(MOCK_VALID_NPSSO);
    await psnCard.getByRole("button", { name: /Conectar cuenta PSN/i }).click();

    await expect(psnCard.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      "connected",
    );

    const { data } = await supabase
      .from("psn_accounts")
      .select("token_status, online_id")
      .eq("user_id", users.userA.id)
      .single();
    expect(data?.token_status).toBe("valid");
    expect(data?.online_id).toBeTruthy();
  });

  test("PSN-04: NPSSO vencido muestra un mensaje específico de expiración", async ({ page }) => {
    await page.goto(CONNECTIONS);
    const psnCard = page.getByRole("region", { name: "PlayStation Network" });
    await psnCard.getByLabel("NPSSO").fill(MOCK_EXPIRED_NPSSO);
    await psnCard.getByRole("button", { name: /Conectar cuenta PSN/i }).click();

    // Mensaje de NpssoExpiredError, distinto del genérico de un NPSSO inválido
    // (issue #24/#68): "expiró" es la palabra que los distingue.
    await expect(psnCard.getByText(/expiró/i)).toBeVisible();
    await expect(psnCard.getByText(/No se pudo validar el NPSSO/i)).toHaveCount(0);
  });

  test("PSN-06: el NPSSO no aparece en el cliente", async ({ page }) => {
    await page.goto(CONNECTIONS);
    const psnCard = page.getByRole("region", { name: "PlayStation Network" });

    const responses: string[] = [];
    page.on("response", async (response) => {
      try {
        const body = await response.text();
        responses.push(body);
      } catch {
        // Respuestas no textuales (imágenes, etc.) -- no pueden filtrar el NPSSO.
      }
    });

    await psnCard.getByLabel("NPSSO").fill(MOCK_VALID_NPSSO);
    await psnCard.getByRole("button", { name: /Conectar cuenta PSN/i }).click();
    await expect(psnCard.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      "connected",
    );

    const html = await page.content();
    expect(html).not.toContain(MOCK_VALID_NPSSO);

    const localStorageDump = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(localStorageDump).not.toContain(MOCK_VALID_NPSSO);

    for (const body of responses) {
      expect(body).not.toContain(MOCK_VALID_NPSSO);
    }
  });
});
