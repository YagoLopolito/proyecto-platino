import { devices, type Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";

/**
 * Shell de navegación de 5 botones (epic #183, issue #185). Casos NAV-01..NAV-07
 * de TESTING_PRD.md §6.19.
 *
 * Corre en el proyecto `authed` (escritorio, userA). Los casos de mobile piden
 * el Pixel 7 con `test.use` dentro de su `describe`, sin `defaultBrowserType`
 * (Playwright no deja cambiar de navegador dentro de un archivo).
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...pixel7 } = devices["Pixel 7"];

/**
 * Swipe horizontal sobre el panel de `SwipeTabs`. Playwright no tiene un
 * gesto de arrastre táctil, así que se despachan los `TouchEvent` a mano: es
 * lo mismo que recibe el listener de React en un celular.
 */
async function swipe(page: Page, dx: number) {
  await page.getByRole("tabpanel").evaluate((panel, deltaX) => {
    const rect = panel.getBoundingClientRect();
    const y = rect.top + Math.min(rect.height / 2, 200);
    const startX = rect.left + rect.width / 2;
    const touch = (x: number) =>
      new Touch({ identifier: 1, target: panel, clientX: x, clientY: y });
    const start = touch(startX);
    const end = touch(startX + deltaX);
    panel.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        touches: [start],
        changedTouches: [start],
      }),
    );
    panel.dispatchEvent(
      new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [end] }),
    );
  }, dx);
}

test.describe("Navegación en mobile", () => {
  test.use(pixel7);

  test("NAV-01: la barra inferior tiene 5 botones accesibles por nombre, en orden", async ({
    page,
  }) => {
    await page.goto("/biblioteca");

    const bar = page.getByTestId("mobile-tab-bar");
    await expect(bar).toBeVisible();

    // Sin texto visible: el nombre accesible sale del `aria-label`.
    const names = await bar
      .locator("li > a, li > button")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    expect(names).toEqual(["Biblioteca", "Buscar", "Registrar", "Actividad", "Perfil"]);
  });

  test("NAV-02: el botón activo tiene aria-current y cambia al navegar", async ({ page }) => {
    await page.goto("/biblioteca");
    const bar = page.getByTestId("mobile-tab-bar");

    await expect(bar.getByRole("link", { name: "Biblioteca" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await bar.getByRole("link", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/\/buscar$/);
    await expect(bar.getByRole("link", { name: "Buscar" })).toHaveAttribute("aria-current", "page");
    await expect(bar.getByRole("link", { name: "Biblioteca" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("NAV-03: el + abre un diálogo y no navega", async ({ page }) => {
    await page.goto("/biblioteca");
    const plus = page.getByTestId("mobile-tab-bar").getByRole("button", { name: "Registrar" });
    await expect(plus).toHaveAttribute("aria-haspopup", "dialog");

    await plus.click();
    const dialog = page.getByRole("dialog", { name: "Registrar" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/biblioteca$/);
    // La única opción que ya existe es registrar un terminado; las de
    // "Jugando ahora" llegan con #187 y están deshabilitadas.
    await expect(
      dialog.getByRole("button", { name: /Registrar un juego terminado/ }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole("button", { name: /Marcar un juego como jugando/ }),
    ).toBeDisabled();

    await dialog.getByRole("button", { name: "Cerrar" }).click();
    await expect(dialog).toBeHidden();
  });

  test("NAV-04: un swipe horizontal cambia de tab y de URL", async ({ page }) => {
    await page.goto("/actividad");
    await expect(page.getByRole("tab", { name: "Amigos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Dedo hacia la izquierda = tab siguiente.
    await swipe(page, -160);
    await expect(page).toHaveURL(/\/actividad\/vos$/);
    await expect(page.getByRole("tab", { name: "Vos" })).toHaveAttribute("aria-selected", "true");

    // Y hacia la derecha vuelve. Un gesto corto no hace nada.
    await swipe(page, 20);
    await expect(page).toHaveURL(/\/actividad\/vos$/);
    await swipe(page, 160);
    await expect(page).toHaveURL(/\/actividad$/);
  });

  test("NAV-06: el engranaje del perfil lleva a Configuración, que ya no está en la barra", async ({
    page,
  }) => {
    await page.goto("/perfil");

    const bar = page.getByTestId("mobile-tab-bar");
    await expect(bar.getByRole("link", { name: /Configuraci/ })).toHaveCount(0);

    await page.getByRole("banner").getByRole("link", { name: "Configuración" }).click();
    await expect(page).toHaveURL(/\/configuracion\/conexiones$/);
  });
});

test.describe("Navegación en escritorio", () => {
  test("NAV-04: las flechas del teclado cambian de tab y de URL", async ({ page }) => {
    await page.goto("/biblioteca");
    const tablist = page.getByRole("tablist", { name: "Biblioteca" });
    const juegos = tablist.getByRole("tab", { name: "Juegos" });
    await expect(juegos).toHaveAttribute("aria-selected", "true");

    await juegos.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/\/biblioteca\/resenas$/);
    await expect(tablist.getByRole("tab", { name: "Reseñas" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(tablist.getByRole("tab", { name: "Reseñas" })).toBeFocused();

    // Desde la primera, ← da la vuelta a la última.
    await page.keyboard.press("Home");
    await expect(page).toHaveURL(/\/biblioteca$/);
    await page.keyboard.press("ArrowLeft");
    await expect(page).toHaveURL(/\/biblioteca\/listas$/);
  });

  test("NAV-05: las rutas viejas redirigen y conservan los parámetros", async ({ page }) => {
    await page.goto("/juegos?fuente=steam&q=zelda");
    await expect(page).toHaveURL(/\/biblioteca\?fuente=steam&q=zelda$/);

    await page.goto("/diario?nuevo=1");
    await expect(page).toHaveURL(/\/perfil\/diario\?nuevo=1$/);
    // El modal de "Marcar como terminado" se sigue abriendo con el parámetro.
    await expect(page.getByRole("dialog", { name: "Marcar como terminado" })).toBeVisible();

    await page.goto("/diario/amigos");
    await expect(page).toHaveURL(/\/biblioteca\/resenas$/);

    // Lo que no se mudó sigue donde estaba.
    await page.goto("/diario/resumen");
    await expect(page).toHaveURL(/\/diario\/resumen$/);
  });

  test("NAV-07: el header tiene buscador, Registrar y menú de la cuenta", async ({ page }) => {
    await page.goto("/biblioteca");
    const header = page.getByRole("banner");

    const nav = header.getByRole("navigation", { name: "Principal" });
    const navNames = await nav.getByRole("link").allTextContents();
    expect(navNames.map((name) => name.trim())).toEqual(["Biblioteca", "Actividad", "Perfil"]);

    // Registrar abre el mismo flujo que el + de mobile, en un modal.
    await header.getByRole("button", { name: "Registrar" }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Menú de la cuenta: Perfil, Configuración y Cerrar sesión.
    await header.getByRole("button", { name: "Cuenta" }).click();
    const menu = page.getByRole("menu", { name: "Cuenta" });
    await expect(menu.getByRole("menuitem", { name: "Perfil" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Configuración" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Cerrar sesión" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // Enter en el buscador lleva a /buscar?q=.
    const search = header.getByRole("searchbox", { name: /Buscar/ });
    await search.fill("zelda");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/buscar\?q=zelda$/);
    await expect(search).toHaveValue("zelda");
  });
});
