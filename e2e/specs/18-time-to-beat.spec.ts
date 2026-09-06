import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { comparableName, pickIgdbGame, secondsToMinutes } from "../../lib/time-to-beat/match";

/**
 * Tiempos estimados de juego al estilo HowLongToBeat, en la ficha de trofeos y
 * en la de diario. Casos TIME-01..TIME-07 de TESTING_PRD.md §6.17.
 *
 * TIME-01..03 son de la función pura (`lib/time-to-beat/match.ts`, sin
 * `server-only` justamente para poder importarla desde el spec); TIME-04 y 05
 * son de UI y corren contra el mock de `lib/time-to-beat/mocks.ts`, que
 * responde 12 h / 30 h para los juegos `[E2E]` sin salir a IGDB.
 */
test.describe("Elección del juego y unidades", () => {
  test("TIME-01: matchea el juego correcto, nunca un DLC ni otra entrega", () => {
    const candidates = [
      { id: 1, name: "God of War Ragnarök: Valhalla" },
      { id: 2, name: "God of War Ragnarök" },
      { id: 3, name: "God of War" },
    ];

    expect(pickIgdbGame("God of War Ragnarök", candidates)?.id).toBe(2);
    expect(pickIgdbGame("God of War", candidates)?.id).toBe(3);
    // Nada parecido: preferimos no mostrar tiempos antes que mostrar los de otro juego.
    expect(pickIgdbGame("Elden Ring", candidates)).toBeNull();
    // Sin el juego base entre los candidatos, un sufijo NO alcanza: "God of
    // War Ragnarök" es otra entrega, no "God of War".
    expect(
      pickIgdbGame("God of War", [{ id: 1, name: "God of War Ragnarök: Valhalla" }]),
    ).toBeNull();
  });

  test("TIME-08: los nombres del catálogo de PSN matchean contra el título de IGDB", () => {
    // Casos reales de la biblioteca: el match exacto los descartaba a todos.
    const cases: [string, string][] = [
      ["Skyrim", "The Elder Scrolls V: Skyrim"],
      ["Call of Duty: Black Ops II - Multiplayer", "Call of Duty: Black Ops II"],
      ["Assassin's Creed® Brotherhood", "Assassin's Creed: Brotherhood"],
      ["HOT WHEELS UNLEASHED™ 2 - Turbocharged", "Hot Wheels Unleashed 2: Turbocharged"],
      ["LEGO® Harry Potter™ Collection", "LEGO Harry Potter Collection"],
      ["ASTRO BOT", "Astro Bot"],
    ];

    for (const [libraryName, igdbName] of cases) {
      const picked = pickIgdbGame(libraryName, [{ id: 7, name: igdbName }]);
      expect(picked?.name, libraryName).toBe(igdbName);
    }

    // El nombre corto de la tienda se limpia antes de comparar.
    expect(comparableName("Call of Duty: Black Ops II - Multiplayer")).toBe(
      "call of duty black ops ii",
    );
  });

  test("TIME-02: las ediciones matchean contra el juego base", () => {
    const candidates = [{ id: 10, name: "The Last of Us Part II" }];
    expect(pickIgdbGame("The Last of Us Part II Remastered", candidates)?.id).toBe(10);
  });

  test("TIME-03: los tiempos vacíos de IGDB no se muestran como cero", () => {
    // IGDB manda 0 cuando no tiene el dato; "0 h" sería mentir.
    expect(secondsToMinutes(0)).toBeNull();
    expect(secondsToMinutes(-5)).toBeNull();
    expect(secondsToMinutes(undefined)).toBeNull();
    expect(secondsToMinutes(43_200)).toBe(720);
  });
});

test.describe("Tiempos estimados en las fichas", () => {
  test("TIME-04: la ficha de trofeos muestra el tiempo de historia y el del 100%", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      // 4 trofeos = el ciclo bronce/plata/oro/platino completo del seed: el
      // juego tiene platino, que es lo que cambia la etiqueta.
      n: 4,
      nameSuffix: "Tiempos Uno",
      np: 1801,
    });

    await page.goto(`/juegos/${gameId}`);

    // Por texto y no por rol: `dt`/`dd` no computan nombre accesible desde su
    // contenido, así que `getByRole("term", { name })` no los encuentra.
    const estimates = page.getByTestId("time-to-beat");
    await expect(estimates.getByText("Pasarlo")).toBeVisible();
    await expect(estimates.getByText("12 h")).toBeVisible();
    // El juego seedeado es de PSN y tiene platino, así que el tiempo de
    // completitud se etiqueta "Platino" y no "Al 100%".
    await expect(estimates.getByText("Platino")).toBeVisible();
    await expect(estimates.getByText("30 h")).toBeVisible();
    // La fuente se cita siempre: los números de IGDB y los de RAWG no se miden igual.
    await expect(estimates.getByText(/IGDB/)).toBeVisible();
  });

  test("TIME-05: los tiempos quedan cacheados en `games` y también salen en el diario", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Tiempos Dos",
      np: 1802,
    });

    // Primera visita: consulta las fuentes y escribe el caché.
    await page.goto(`/juegos/${gameId}`);
    await expect(page.getByTestId("time-to-beat")).toBeVisible();

    await expect
      .poll(async () => {
        const { data } = await supabase
          .from("games")
          .select("time_to_beat_minutes, time_to_complete_minutes, time_estimates_source")
          .eq("id", gameId)
          .single();
        return data;
      })
      .toMatchObject({
        time_to_beat_minutes: 720,
        time_to_complete_minutes: 1800,
        time_estimates_source: "igdb",
      });

    // La ficha de diario lee el mismo caché: el dato no depende de por dónde entró el usuario.
    await page.goto(`/juegos/${gameId}/diario`);
    const estimates = page.getByTestId("time-to-beat");
    await expect(estimates.getByText("12 h")).toBeVisible();
    await expect(estimates.getByText("30 h")).toBeVisible();
  });
});

test.describe("Fallo al consultar IGDB", () => {
  test("TIME-07: si no se pudo consultar, el juego no queda marcado como consultado", async ({
    page,
    supabase,
    users,
  }) => {
    // El mock devuelve "unavailable" para los nombres con este marcador: es el
    // caso de credenciales/red/401, distinto de "IGDB no conoce el juego".
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: `SIN-IGDB ${users.runId}`,
      np: 1803,
    });

    await page.goto(`/juegos/${gameId}`);
    // La ficha carga igual, sólo que sin la sección de tiempos.
    await expect(page.getByRole("heading", { name: /Trofeos\s+2/i })).toBeVisible();
    await expect(page.getByTestId("time-to-beat")).toHaveCount(0);

    const { data } = await supabase
      .from("games")
      .select("time_estimates_checked_at, time_estimates_source")
      .eq("id", gameId)
      .single();

    // Lo que importa: NO se cachea. Si se marcara como consultado, el juego
    // quedaría sin tiempos para siempre por un fallo pasajero.
    expect(data?.time_estimates_checked_at).toBeNull();
    expect(data?.time_estimates_source).toBeNull();
  });
});

/**
 * Verificación contra IGDB real. Fuera de la corrida por defecto (`@live`,
 * `npm run e2e:live`): necesita `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` y sale a
 * internet, cosa que CI no hace. Es el único lugar donde se comprueba que el
 * endpoint y los nombres de campo siguen siendo los que espera el cliente.
 */
test.describe("IGDB real", () => {
  test("TIME-06 @live: IGDB devuelve los dos tiempos de un juego conocido", async () => {
    test.skip(!process.env.IGDB_CLIENT_ID, "Sin credenciales de IGDB.");

    const { findIgdbTimeToBeat } = await import("../../lib/time-to-beat/igdb");
    const lookup = await findIgdbTimeToBeat("The Witcher 3: Wild Hunt");

    // `unavailable` es el que importa distinguir: significa que las
    // credenciales o el endpoint están mal, no que IGDB no conozca el juego.
    expect(lookup.status).toBe("ok");
    if (lookup.status !== "ok") return;
    expect(lookup.times.beatMinutes ?? 0).toBeGreaterThan(0);
    expect(lookup.times.completeMinutes ?? 0).toBeGreaterThan(0);
  });
});
