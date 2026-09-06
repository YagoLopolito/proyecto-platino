import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import {
  cleanGameName,
  extractGameNameFromFile,
  groupFilesByGame,
  matchGameByName,
} from "../../lib/diary/screenshot-import";

/**
 * Importador masivo de capturas (`/diario/capturas`). Casos SHOT-01..SHOT-05
 * de TESTING_PRD.md §6.16.
 *
 * Sony no expone la galería de capturas de PSN por ninguna API usable, así que
 * lo que se testea es la deducción del juego a partir de la ruta del archivo
 * exportado de la consola -- que es lo que hace que soltar una carpeta entera
 * reemplace subir captura por captura.
 */
test.describe("Deducción del juego desde el archivo", () => {
  test("SHOT-01: el nombre sale de la carpeta que escribe la consola", () => {
    expect(
      extractGameNameFromFile({
        name: "Bloodborne_20160101120000.jpg",
        relativePath: "PS4/SHARE/Screenshots/Bloodborne/Bloodborne_20160101120000.jpg",
      }),
    ).toBe("Bloodborne");

    expect(
      extractGameNameFromFile({
        name: "shot.jpg",
        relativePath: "PS5/CREATE/Screenshots/Ghost of Tsushima/shot.jpg",
      }),
    ).toBe("Ghost of Tsushima");
  });

  test("SHOT-02: sin carpeta, el nombre sale del archivo y se le saca la fecha", () => {
    expect(extractGameNameFromFile({ name: "God of War_20230115121314.jpg" })).toBe("God of War");
    expect(extractGameNameFromFile({ name: "God of War_20230115_121314.png" })).toBe("God of War");
    expect(extractGameNameFromFile({ name: "God of War-2023-01-15-12-13-14.jpg" })).toBe(
      "God of War",
    );
    expect(extractGameNameFromFile({ name: "God of War_20230115121314 (1).jpg" })).toBe(
      "God of War",
    );
  });

  test("SHOT-03: un número que es parte del título no se recorta", () => {
    // Recortar cualquier grupo final de dígitos rompía estos dos.
    expect(cleanGameName("Battlefield 2042_20230115121314")).toBe("Battlefield 2042");
    expect(cleanGameName("Forza Horizon 5")).toBe("Forza Horizon 5");
    // Un nombre opaco (la PS App baja las capturas así) no dice nada del juego.
    expect(cleanGameName("20230115121314")).toBeNull();
    expect(extractGameNameFromFile({ name: "IMG_20230115121314.jpg" })).toBe("IMG");
  });

  test("SHOT-04: el match tolera ediciones y no confunde juegos de la misma saga", () => {
    const games = [
      { id: "a", name: "God of War" },
      { id: "b", name: "God of War Ragnarök" },
      { id: "c", name: "The Last of Us Part II Remastered" },
    ];

    expect(matchGameByName("God of War", games)?.id).toBe("a");
    expect(matchGameByName("God of War Ragnarök", games)?.id).toBe("b");
    // "Remastered" lo saca `normalizeName`, igual que en el dedup de catálogo.
    expect(matchGameByName("The Last of Us Part II", games)?.id).toBe("c");
    expect(matchGameByName("Elden Ring", games)).toBeNull();
  });

  test("SHOT-05: los archivos se agrupan por juego y lo no deducido queda aparte", () => {
    const games = [{ id: "a", name: "Bloodborne" }];
    const files = [
      { name: "a.jpg", relativePath: "PS4/SHARE/Screenshots/Bloodborne/a.jpg" },
      { name: "Bloodborne_20160101120000.jpg" },
      { name: "IMG_0001.jpg" },
    ];

    const groups = groupFilesByGame(files, games);

    expect(groups).toHaveLength(2);
    // El grupo con juego va primero: es lo que el usuario confirma de un vistazo.
    expect(groups[0].game?.id).toBe("a");
    expect(groups[0].fileIndexes).toEqual([0, 1]);
    expect(groups[1].game).toBeNull();
    expect(groups[1].fileIndexes).toEqual([2]);
  });
});

test.describe("Pantalla de importación", () => {
  test("SHOT-06: la carpeta elegida se agrupa y preselecciona el juego de la biblioteca", async ({
    page,
    supabase,
    users,
  }) => {
    const suffix = `Capturas ${users.runId}`;
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: suffix,
      np: 1701,
    });
    const gameName = testGameTitle(suffix);

    await page.goto("/diario/capturas");
    await expect(page.getByRole("heading", { name: "Importar capturas" })).toBeVisible();

    // El input de carpeta no expone `webkitRelativePath` desde Playwright, así
    // que se prueba el camino de archivos sueltos: el nombre del archivo que
    // escribe la consola alcanza para deducir el juego.
    await page.getByLabel("Elegir capturas sueltas").setInputFiles([
      {
        name: `${gameName}_20230115121314.jpg`,
        mimeType: "image/jpeg",
        buffer: Buffer.from("fake-jpeg"),
      },
    ]);

    // El nombre del juego aparece dos veces (el título del grupo y su opción
    // en el select), así que la aserción va sobre el valor del select: es
    // además lo que importa, que el juego venga preseleccionado.
    const groups = page.getByTestId("screenshot-import-groups");
    await expect(groups.getByRole("combobox")).toHaveValue(gameId);
    await expect(groups.getByText(/detectado automáticamente/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Importar 1 captura/ })).toBeVisible();
  });

  test("SHOT-07: un archivo sin juego detectado no se sube hasta que se le asigne uno", async ({
    page,
  }) => {
    await page.goto("/diario/capturas");

    // Nombre opaco: es como baja las capturas la PS App, no dice de qué juego es.
    await page.getByLabel("Elegir capturas sueltas").setInputFiles([
      {
        name: "20230115121314.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("fake-jpeg"),
      },
    ]);

    const groups = page.getByTestId("screenshot-import-groups");
    await expect(groups.getByText("Sin juego detectado")).toBeVisible();

    // Sin juego asignado no se sube nada: el botón queda en cero y avisa.
    await page.getByRole("button", { name: /Importar 0 capturas/ }).click();
    await expect(page.getByText(/Ninguna captura tiene un juego asignado/)).toBeVisible();
  });
});
