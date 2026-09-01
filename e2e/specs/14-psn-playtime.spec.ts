import { test, expect } from "@playwright/test";
import { decideNextPage } from "../../lib/psn/pagination";

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
