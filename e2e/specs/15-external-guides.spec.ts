import { test, expect } from "@playwright/test";
import {
  isNoiseTitle,
  isReadableLanguage,
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

/**
 * LINK-07: idioma de las guías de Steam Community.
 *
 * El filtro de ruido sacaba las traducciones, pero una guía de logros escrita
 * en ruso o en portugués igual pasaba: es una guía de verdad, solo que el
 * usuario no la puede leer. Solo español e inglés.
 */
test.describe("Idioma de las guías externas de Steam", () => {
  const unreadable = [
    "Гайд по достижениям",
    "全成就攻略",
    "업적 가이드",
    "Guia de conquistas 100% em português",
    "Guida completa agli obiettivi",
    "Komplettlösung mit allen Erfolgen",
    "Poradnik do osiągnięć",
  ];

  const readable = [
    "100% Achievement Guide",
    "Guía de logros y coleccionables",
    "Full walkthrough with all endings",
  ];

  test("LINK-07: los títulos en otros idiomas se descartan", () => {
    for (const title of unreadable) {
      expect(isReadableLanguage(title), title).toBe(false);
    }
  });

  test("LINK-07: los títulos en español y en inglés se conservan", () => {
    for (const title of readable) {
      expect(isReadableLanguage(title), title).toBe(true);
    }
  });

  test("LINK-07: el ranking descarta lo que no está en español ni en inglés", () => {
    const ranked = rankSteamGuides(
      [
        { id: "1", title: "Гайд по достижениям" },
        { id: "2", title: "Guia de conquistas 100% em português" },
        { id: "3", title: "100% Achievement Guide" },
      ],
      // Etiquetadas por su autor: aun así, el idioma manda.
      new Set(["1", "2", "3"]),
      5,
    );

    expect(ranked.map((g) => g.id)).toEqual(["3"]);
  });
});
