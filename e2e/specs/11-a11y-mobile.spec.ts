import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";

/**
 * Mobile y PWA. Corre en el proyecto `mobile` (Pixel 7, ya logueado como
 * userA): casos A11Y-01/A11Y-05, MOB-* y PWA-* de TESTING_PRD.md §6.11.
 *
 * Las rutas que se prueban se seedean acá: la suite es paralela y ningún test
 * puede depender de lo que dejó otro.
 */

const CORE_ROUTES = ["/juegos", "/diario", "/perfil", "/configuracion/conexiones"];

test.describe("Mobile", () => {
  for (const route of CORE_ROUTES) {
    test(`A11Y-01: ${route} no tiene scroll horizontal en un celular`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId("mobile-tab-bar")).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }

  test("A11Y-01: la ficha de un juego no tiene scroll horizontal", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 5,
      nameSuffix: "Mobile Ficha",
      np: 111,
    });

    await page.goto(`/juegos/${gameId}`);
    await expect(page.getByRole("heading", { name: /Trofeos\s+5/i })).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("A11Y-05: cada pantalla tiene un solo h1", async ({ page }) => {
    await page.goto("/perfil");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("MOB-01: la barra inferior navega entre secciones", async ({ page }) => {
    await page.goto("/juegos");

    const tabBar = page.getByTestId("mobile-tab-bar");
    await tabBar.getByRole("link", { name: "Diario" }).click();
    await expect(page).toHaveURL(/\/diario$/);
    // El tab activo se marca con aria-current, no sólo con color.
    await expect(tabBar.getByRole("link", { name: "Diario" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await tabBar.getByRole("link", { name: "Perfil" }).click();
    await expect(page).toHaveURL(/\/perfil$/);
  });

  test("MOB-02: la barra inferior no tapa el final de la página", async ({ page }) => {
    await page.goto("/perfil");

    // La barra es `fixed`: lo único que impide que tape el final de la página
    // es el spacer del layout, que tiene que reservar al menos su alto.
    const heights = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="mobile-tab-bar"]');
      const spacer = document.querySelector('[data-testid="tab-bar-spacer"]');
      if (!bar || !spacer) return null;
      return {
        bar: bar.getBoundingClientRect().height,
        spacer: spacer.getBoundingClientRect().height,
      };
    });

    expect(heights).not.toBeNull();
    expect(heights!.bar).toBeGreaterThan(0);
    expect(heights!.spacer).toBeGreaterThanOrEqual(heights!.bar);
  });

  test("MOB-04: la biblioteca es una grilla de carátulas con su progreso", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 4,
      nameSuffix: "Mobile Grilla",
      np: 112,
    });
    await supabase.from("user_trophies").upsert(
      trophyIds.slice(0, 1).map((trophyId) => ({
        user_id: users.userA.id,
        trophy_id: trophyId,
        unlocked_at: new Date().toISOString(),
      })),
    );

    await page.goto("/juegos");
    const poster = page.getByTestId("game-card").filter({ hasText: "Mobile Grilla" });
    await expect(poster).toBeVisible();
    // La barra de progreso sobre la carátula es la que reemplaza al detalle
    // que antes mostraba la fila: 1 de 4 = 25%.
    await expect(poster.getByRole("img", { name: /25% completado/ })).toBeVisible();
    await expect(poster.getByRole("link")).toHaveAttribute("href", `/juegos/${gameId}`);
  });

  test("MOB-03: la nav de escritorio no se duplica en mobile", async ({ page }) => {
    await page.goto("/juegos");
    // El header tiene su propia nav, oculta por CSS en mobile: la que se ve es
    // sólo la de abajo.
    await expect(page.getByRole("navigation", { name: "Principal" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Secciones" })).toBeVisible();
  });
});

test.describe("PWA", () => {
  test("PWA-01: el manifest declara todo lo que hace falta para instalar", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);

    const manifest = await response.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/juegos");
    expect(manifest.short_name).toBe("Platinoob");

    // Android necesita 192 y 512, y una maskable para no recortar el ícono.
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(
      true,
    );
  });

  test("PWA-02: el service worker se sirve sin caché larga", async ({ request }) => {
    const response = await request.get("/sw.js");
    expect(response.ok()).toBe(true);
    // Si Vercel lo cachea, un SW nuevo tarda días en llegar a los celulares.
    expect(response.headers()["cache-control"]).toContain("max-age=0");
    expect(await response.text()).toContain("platinoob-static");
  });

  test("PWA-03: /api/version expone el build id sin cachear", async ({ request }) => {
    const response = await request.get("/api/version");
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toContain("no-store");

    const { buildId } = await response.json();
    expect(typeof buildId).toBe("string");
    expect(buildId.length).toBeGreaterThan(0);
  });

  test("PWA-04: la pantalla de offline se sirve sin sesión", async ({ browser }) => {
    // Sin `storageState`: el fallback del service worker se precachea en el
    // `install`, antes de que haya usuario, así que no puede pedir sesión.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "Sin conexión" })).toBeVisible();
    await context.close();
  });

  test("PWA-05: Conexiones ofrece instalar la app", async ({ page }) => {
    await page.goto("/configuracion/conexiones");
    await expect(page.getByTestId("install-app-card")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Instalar Platinoob en el celular/i }),
    ).toBeVisible();
  });
});
