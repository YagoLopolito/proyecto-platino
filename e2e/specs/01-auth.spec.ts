import { test, expect } from "../fixtures/test";

/**
 * Auth (proyecto `anon`, sin storageState). Casos AUTH-01..09 de
 * TESTING_PRD.md sección 6.1. Usa a userA (creado en el global-setup) para
 * loguearse por UI -- no requiere sesión previa, así que corre bien sin
 * storageState.
 */
test.describe("Auth", () => {
  test("AUTH-01: rutas protegidas redirigen sin sesión", async ({ page }) => {
    for (const route of ["/perfil", "/juegos", "/psn", "/diario"]) {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("AUTH-02: rutas públicas cargan sin sesión, sin redirect", async ({ page }) => {
    // "/" no es un caso de no-redirect: app/page.tsx siempre redirige (a
    // /login sin sesión, a /perfil con sesión) por diseño. Lo que importa acá
    // es que no exige sesión -- termina en /login, no en un 4xx/5xx.
    const home = await page.goto("/");
    expect(home?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/login");

    for (const route of ["/login", "/registro"]) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(route);
    }
  });

  test("AUTH-03: login con credenciales válidas redirige a /perfil", async ({ page, users }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(users.userA.email);
    await page.getByLabel(/contrase/i).fill(users.userA.password);
    await page.getByRole("button", { name: /ingresar/i }).click();

    await expect(page).toHaveURL(/\/perfil/);
    // Hay dos botones "Cerrar sesión" en la página (nav + acción de perfil);
    // alcanza con que al menos uno esté visible.
    await expect(page.getByRole("button", { name: /cerrar sesión/i }).first()).toBeVisible();
  });

  test("AUTH-04: login con password incorrecta muestra el mensaje genérico", async ({
    page,
    users,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(users.userA.email);
    await page.getByLabel(/contrase/i).fill("password-basura-que-no-es");
    await page.getByRole("button", { name: /ingresar/i }).click();

    await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-05: login con email inexistente muestra el mismo mensaje que AUTH-04", async ({
    page,
  }) => {
    // El punto del caso es que el texto sea *idéntico* al de AUTH-04: si acá
    // dijera algo distinto ("Email not confirmed", "user not found"), se
    // podría enumerar qué cuentas existen probando emails (issue #126).
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(`e2e-inexistente-${Date.now()}@example.com`);
    await page.getByLabel(/contrase/i).fill("password-basura-que-no-es");
    await page.getByRole("button", { name: /ingresar/i }).click();

    await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-09: logout redirige a /login y las rutas protegidas vuelven a pedir sesión", async ({
    page,
    users,
  }) => {
    // userC, no userA: supabase.auth.signOut() revoca el refresh token del
    // lado del servidor (scope "global" por defecto), y userA tiene una
    // storageState compartida que reutiliza el resto de la suite (proyecto
    // "authed"). Desloguearlo acá la invalidaría para todos esos specs.
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(users.userC.email);
    await page.getByLabel(/contrase/i).fill(users.userC.password);
    await page.getByRole("button", { name: /ingresar/i }).click();
    await expect(page).toHaveURL(/\/perfil/);

    await page.getByRole("button", { name: /cerrar sesión/i }).first().click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/perfil");
    await expect(page).toHaveURL(/\/login/);
  });
});
