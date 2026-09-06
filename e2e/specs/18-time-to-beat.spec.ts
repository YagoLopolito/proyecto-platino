import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { pickIgdbGame, secondsToMinutes } from "../../lib/time-to-beat/match";

/**
 * Tiempos estimados de juego al estilo HowLongToBeat, en la ficha de trofeos y
 * en la de diario. Casos TIME-01..TIME-05 de TESTING_PRD.md §6.17.
 *
 * TIME-01..03 son de la función pura (`lib/time-to-beat/match.ts`, sin
 * `server-only` justamente para poder importarla desde el spec); TIME-04 y 05
 * son de UI y corren contra el mock de `lib/time-to-beat/mocks.ts`, que
 * responde 12 h / 30 h para los juegos `[E2E]` sin salir a IGDB.
 */
test.describe("Elección del juego y unidades", () => {
  test("TIME-01: sólo matchea el juego exacto, nunca un DLC ni otra entrega", () => {
    const candidates = [
      { id: 1, name: "God of War Ragnarök: Valhalla" },
      { id: 2, name: "God of War Ragnarök" },
      { id: 3, name: "God of War" },
    ];

    expect(pickIgdbGame("God of War Ragnarök", candidates)?.id).toBe(2);
    expect(pickIgdbGame("God of War", candidates)?.id).toBe(3);
    // Nada parecido: preferimos no mostrar tiempos antes que mostrar los de otro juego.
    expect(pickIgdbGame("Elden Ring", candidates)).toBeNull();
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
    const times = await findIgdbTimeToBeat("The Witcher 3: Wild Hunt");

    expect(times).not.toBeNull();
    expect(times?.beatMinutes ?? 0).toBeGreaterThan(0);
    expect(times?.completeMinutes ?? 0).toBeGreaterThan(0);
  });
});
