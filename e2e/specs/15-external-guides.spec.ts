import { test, expect } from "@playwright/test";
import {
  isNoiseTitle,
  rankSteamGuides,
  relevanceScore,
} from "../../lib/external-guides/steam-relevance";

/**
 * LINK-06: relevancia de las guías de Steam Community.
 *
 * Pedirle a `QueryFiles` lo más votado del juego devolvía traducciones no
 * oficiales, mods y curiosidades ("How to break the game in one turn"), que no
 * sirven para platinar. Los títulos de acá salen de una corrida real sobre
 * STAR WARS Zero Company.
 */
test.describe("Relevancia de guías externas de Steam", () => {
  const noise = [
    "Канонический русификатор от NoctaKraken с постоянными обновлениями",
    "Slovenský preklad / Slovak Translation",
    "Неофициальный русский текст v0.1.0 (слот Polish)",
    "Spanish Translation / Traducción al español",
    "FPS fix and performance optimization",
  ];

  const relevant = [
    "100% Achievement Guide",
    "Full walkthrough with all collectibles",
    "Best builds for every class",
    "Guía de logros y secretos",
  ];

  test("LINK-06: las traducciones, mods y fixes se descartan", () => {
    for (const title of noise) {
      expect(isNoiseTitle(title), title).toBe(true);
    }
  });

  test("LINK-06: las guías de logros, 100%, walkthrough y builds se conservan", () => {
    for (const title of relevant) {
      expect(isNoiseTitle(title), title).toBe(false);
      expect(relevanceScore(title), title).toBeGreaterThan(0);
    }
  });

  test("LINK-06: el ranking filtra el ruido y prioriza lo etiquetado", () => {
    const guides = [
      { id: "1", title: noise[0] },
      { id: "2", title: "How to break the game in one turn" },
      { id: "3", title: "Full walkthrough with all collectibles" },
      { id: "4", title: "100% Achievement Guide" },
    ];

    // La guía 3 no está etiquetada; la 4 sí, así que va primero.
    const ranked = rankSteamGuides(guides, new Set(["4"]), 5);

    expect(ranked.map((g) => g.id)).toEqual(["4", "3"]);
  });

  test("LINK-06: si nada es relevante, devuelve vacío en vez de ruido", () => {
    const ranked = rankSteamGuides(
      noise.map((title, i) => ({ id: String(i), title })),
      new Set<string>(),
      5,
    );

    expect(ranked).toEqual([]);
  });
});
