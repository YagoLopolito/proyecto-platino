import { test, expect } from "@playwright/test";

/**
 * Smoke contra un deploy real (PLAYWRIGHT_BASE_URL). Sin sesion, sin escrituras
 * y sin mocks: solo verifica que la app este viva y que las rutas protegidas
 * sigan protegidas. Casos SMOKE-01..05 de TESTING_PRD.md seccion 6.13.
 */
test.describe("Smoke", () => {
  test("SMOKE-01: la landing carga", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/.+/);
  });

  test("SMOKE-02: login y registro cargan con sus formularios", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();

    await page.goto("/registro");
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  for (const route of ["/perfil", "/juegos", "/psn", "/diario"]) {
    test(`SMOKE-03: ${route} redirige a login sin sesion`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
