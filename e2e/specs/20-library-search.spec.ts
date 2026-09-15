import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { matchesSearch, searchKey } from "@/lib/library/search";
import { testGameTitle } from "../helpers/ids";

/**
 * Buscador de la biblioteca (`app/(app)/juegos/GamesLibrary.tsx`). Casos
 * LIB-01/LIB-02/LIB-03 de TESTING_PRD.md §6.3.
 *
 * El filtro es 100% client-side sobre la biblioteca ya cargada, así que no
 * hace falta esperar navegación: lo que se verifica es la grilla y el `?q=` de
 * la URL, que es lo que hace que la búsqueda sobreviva al reload.
 */
test.describe("Buscador de la biblioteca", () => {
  const SUFFIX = "Buscador Pokemon";

  test.beforeEach(async ({ supabase, users }) => {
    await seedGameWithTrophies(supabase, users.userA.id, { n: 2, nameSuffix: SUFFIX, np: 120 });
    // Un segundo juego que NO matchea: sin él, "filtró" y "no hizo nada" se
    // ven igual cuando la biblioteca tiene un solo juego.
    await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Buscador Otro Juego",
      np: 121,
    });
  });

  test("LIB-01: buscar por nombre deja sólo los juegos que coinciden", async ({ page }) => {
    await page.goto("/juegos");

    const search = page.getByRole("searchbox", { name: /Buscar juego/i });
    await search.fill("Buscador Pokemon");

    const cards = page.getByTestId("game-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(testGameTitle(SUFFIX));

    // Limpiar devuelve la biblioteca entera.
    await page.getByRole("button", { name: "Limpiar búsqueda" }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByTestId("game-card").first()).toBeVisible();
    expect(await page.getByTestId("game-card").count()).toBeGreaterThan(1);
  });

  test("LIB-02: la búsqueda queda en la URL y sobrevive al reload", async ({ page }) => {
    await page.goto("/juegos");
    await page.getByRole("searchbox", { name: /Buscar juego/i }).fill("Buscador Pokemon");

    await expect(page).toHaveURL(/[?&]q=/);

    await page.reload();
    await expect(page.getByRole("searchbox", { name: /Buscar juego/i })).toHaveValue(
      "Buscador Pokemon",
    );
    await expect(page.getByTestId("game-card")).toHaveCount(1);
  });

  test("LIB-03: una búsqueda sin resultados lo dice con el término buscado", async ({ page }) => {
    await page.goto("/juegos");
    await page
      .getByRole("searchbox", { name: /Buscar juego/i })
      .fill("zzz-no-existe-ningun-juego-asi");

    await expect(page.getByTestId("game-card")).toHaveCount(0);
    await expect(page.getByText(/zzz-no-existe-ningun-juego-asi/)).toBeVisible();
  });

  test("LIB-04: el matcher ignora acentos, símbolos y el orden de las palabras", () => {
    // Puro: `lib/library/search.ts` no toca red ni base, así que se testea
    // acá mismo en vez de montar un juego por caso (igual que
    // `steam-relevance` y `screenshot-import`).
    expect(searchKey("Pokémon™: Edición Especial")).toBe("pokemon edicion especial");
    expect(matchesSearch("Pokémon Legends: Arceus", "pokemon")).toBe(true);
    expect(matchesSearch("The Last of Us™ Part II", "last us")).toBe(true);
    // Todas las palabras tienen que estar: una sola que no matchee descarta.
    expect(matchesSearch("The Last of Us", "last halo")).toBe(false);
    // Un query vacío no filtra nada.
    expect(matchesSearch("God of War", "   ")).toBe(true);
    // A diferencia del normalizador del catálogo, "remastered" es buscable.
    expect(matchesSearch("Metro: Last Light Redux Remastered", "remastered")).toBe(true);
  });
});
