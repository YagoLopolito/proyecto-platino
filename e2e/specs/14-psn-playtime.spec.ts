import { test, expect } from "@playwright/test";
import { decideNextPage } from "../../lib/psn/pagination";
import {
  collectPlaytimePages,
  type PlaytimePageFetcher,
} from "../../lib/psn/playtime-pages";

/**
 * SYNC-14: paginación de la lista de juegos jugados de PSN, de donde salen las
 * horas. Es un test de unidad sobre una función pura (no abre el browser):
 * `lib/psn/mocks.ts` reemplaza `fetchPsnPlaytime` entera bajo `E2E_MOCKS=1`, así
 * que el bucle de paginación no lo cubre ningún test de UI, y es justamente
 * donde estuvo el bug -- se cortaba en la primera página y quedaban con horas
 * sólo los últimos juegos jugados.
 */
test.describe("Paginación de horas jugadas de PSN", () => {
  test("SYNC-14: no corta en la primera página cuando PSN no manda totalItemCount", async () => {
    // El caso real: página más chica que el `limit` pedido y sin metadata de
    // paginación. Antes esto cortaba (`totalItemCount ?? 0` => `offset >= 0`).
    const decision = decideNextPage({ titlesInPage: 3 }, 0);
    expect(decision).toEqual({ done: false, nextOffset: 3 });
  });

  test("SYNC-14: sigue el nextOffset del endpoint cuando avanza", async () => {
    expect(decideNextPage({ titlesInPage: 25, nextOffset: 100 }, 0)).toEqual({
      done: false,
      nextOffset: 100,
    });
    // Un nextOffset que no avanza (0, repetido) sería un ciclo: se ignora y se
    // avanza por la cantidad de títulos recibidos.
    expect(decideNextPage({ titlesInPage: 25, nextOffset: 10 }, 10)).toEqual({
      done: false,
      nextOffset: 35,
    });
  });

  test("SYNC-14: corta con la página vacía o al llegar al total informado", async () => {
    expect(decideNextPage({ titlesInPage: 0 }, 120)).toEqual({ done: true });
    expect(decideNextPage({ titlesInPage: 0, totalItemCount: 500 }, 120)).toEqual({ done: true });
    expect(decideNextPage({ titlesInPage: 20, totalItemCount: 120 }, 100)).toEqual({ done: true });
    // Todavía falta biblioteca: no corta.
    expect(decideNextPage({ titlesInPage: 20, totalItemCount: 368 }, 100)).toEqual({
      done: false,
      nextOffset: 120,
    });
  });

  test("SYNC-14: recorre una biblioteca grande en páginas chicas sin cortarse", async () => {
    // 368 juegos (el tamaño real de la biblioteca donde apareció el bug) en
    // páginas de 3, sin totalItemCount: tiene que verlos a todos.
    const TOTAL = 368;
    let offset = 0;
    let seen = 0;
    for (let page = 0; page < 500; page += 1) {
      const titlesInPage = Math.min(3, TOTAL - offset);
      seen += titlesInPage;
      const decision = decideNextPage({ titlesInPage }, offset);
      if (decision.done) break;
      offset = decision.nextOffset;
    }
    expect(seen).toBe(TOTAL);
  });
});

/**
 * SYNC-15: qué pasa cuando una página de la lista falla a mitad del recorrido.
 * El caso real fue la función serverless muriendo por timeout después de la
 * página 0 (los trofeos se pedían antes, uno por título, y se comían el
 * presupuesto). Como el upsert omite la columna cuando un título no cruza,
 * perder el mapa entero deja horas viejas congeladas en unos pocos juegos y no
 * se distingue de un fallo del cruce por nombre.
 */
test.describe("Horas jugadas de PSN: fallo parcial", () => {
  const page = (names: string[], nextOffset: number | null) => ({
    titles: names.map((name) => ({ name, playDuration: "PT10H0M0S" })),
    nextOffset,
    totalItemCount: null,
  });

  test("SYNC-15: conserva las páginas ya obtenidas cuando una falla", async () => {
    const fetchPage: PlaytimePageFetcher = async (offset) => {
      if (offset === 0) return page(["Bloodborne", "Returnal"], 2);
      throw new Error("PSN 500");
    };

    const result = await collectPlaytimePages(fetchPage);

    expect(result.titlesFetched).toBe(2);
    expect([...result.byName.values()]).toEqual([600, 600]);
  });

  test("SYNC-15: junta todas las páginas cuando ninguna falla", async () => {
    const fetchPage: PlaytimePageFetcher = async (offset) => {
      if (offset === 0) return page(["Bloodborne", "Returnal"], 2);
      if (offset === 2) return page(["Ghost of Tsushima"], 3);
      return page([], null);
    };

    const result = await collectPlaytimePages(fetchPage);

    expect(result.titlesFetched).toBe(3);
    expect(result.byName.size).toBe(3);
  });
});
