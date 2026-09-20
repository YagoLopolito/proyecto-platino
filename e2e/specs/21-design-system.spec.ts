import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";

/**
 * Sistema de diseño: tokens, escala tipográfica y set de íconos.
 * Casos DS-01..DS-07 de TESTING_PRD.md §6.18 (fases 1 y 2 del issue #176).
 *
 * Por qué se testea algo "visual": lo que se verifica acá no es cómo se ve,
 * sino que las piezas del sistema **existan y se apliquen de verdad**. Los dos
 * bugs que motivaron esta fase eran exactamente de ese tipo y ninguno se veía
 * en una review del diff: la fuente cargada no la usaba nadie porque `body`
 * la pisaba con Arial, y los tokens de `globals.css` estaban definidos pero
 * con 0 usos. Un test que mira el estilo computado los agarra; uno que mira
 * clases de Tailwind, no.
 */

/** Familias que next/font genera para Geist y Newsreader (nombre con hash). */
const SANS = /Geist/i;
const SERIF = /Newsreader/i;

test.describe("Sistema de diseño", () => {
  test("DS-01: la app no se renderiza en la fuente por defecto del navegador", async ({ page }) => {
    await page.goto("/perfil");

    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);

    // El bug que arregla la fase 1: `body` declaraba `Arial, Helvetica` y la
    // Geist que carga `app/layout.tsx` no la usaba absolutamente nadie.
    expect(bodyFont).toMatch(SANS);
    expect(bodyFont).not.toMatch(/^Arial/);
  });

  test("DS-02: los tokens del sistema están definidos y con valor", async ({ page }) => {
    await page.goto("/perfil");

    // Un token sin valor resuelve a "" y el color cae al heredado, así que la
    // pantalla se ve "casi bien" y el error pasa desapercibido. Por eso se
    // verifica el valor, no la mera presencia de la declaración.
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const names = [
        "--background",
        "--surface",
        "--surface-raised",
        "--surface-hover",
        "--ink",
        "--ink-muted",
        "--ink-faint",
        "--border",
        "--border-strong",
        "--accent",
        "--accent-2",
        "--success",
        "--danger",
        "--warning",
        "--trophy-bronze",
        "--trophy-silver",
        "--trophy-gold",
        "--trophy-platinum",
        "--trophy-neutral",
        "--font-ui",
        "--font-editorial",
      ];
      return Object.fromEntries(names.map((n) => [n, root.getPropertyValue(n).trim()]));
    });

    for (const [name, value] of Object.entries(tokens)) {
      expect(value, `el token ${name} no tiene valor`).not.toBe("");
    }

    // Las dos familias tienen que resolver a las fuentes que carga el layout,
    // no a la genérica de fallback: si `--font-newsreader` no llegara, el
    // token igual tendría valor (`ui-serif, Georgia`) y el test pasaría.
    expect(tokens["--font-ui"]).toMatch(SANS);
    expect(tokens["--font-editorial"]).toMatch(SERIF);
  });

  test("DS-03: la escala tipográfica está compilada y produce jerarquía real", async ({ page }) => {
    await page.goto("/perfil");

    // La tira de stats del perfil usa los dos extremos de la escala: el número
    // grande (`type-stat`) y la etiqueta en versalitas (`type-overline`).
    const stat = page.locator(".type-stat").first();
    const overline = page.locator(".type-overline").first();
    await expect(stat).toBeVisible();
    await expect(overline).toBeVisible();

    const styles = await page.evaluate(() => {
      const read = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          fontSize: parseFloat(s.fontSize),
          textTransform: s.textTransform,
          letterSpacing: s.letterSpacing,
          fontVariantNumeric: s.fontVariantNumeric,
        };
      };
      return { stat: read(".type-stat"), overline: read(".type-overline") };
    });

    // Si una `@utility` no compila, la clase existe en el HTML pero no aplica
    // nada: el tamaño cae al heredado y los dos niveles miden igual. Esa es
    // exactamente la falla que este assert detecta.
    expect(styles.stat!.fontSize).toBeGreaterThan(styles.overline!.fontSize * 1.5);
    expect(styles.overline!.textTransform).toBe("uppercase");
    expect(parseFloat(styles.overline!.letterSpacing)).toBeGreaterThan(0);
    // `tabular-nums` es lo que impide que el número baile al actualizarse.
    expect(styles.stat!.fontVariantNumeric).toContain("tabular-nums");
  });

  test("DS-04: el contenido generado por IA se marca con un ícono del set, no con un emoji", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Diseno Iconos",
      np: 2101,
    });

    // Se escribe el caché de tiempos a mano: lo que se prueba es cómo se
    // muestra la fuente `ai`, no cómo se consigue. `time_estimates_checked_at`
    // evita que la ficha vuelva a consultar y pise la fuente.
    await supabase
      .from("games")
      .update({
        time_to_beat_minutes: 600,
        time_to_complete_minutes: 1500,
        time_estimates_source: "ai",
        time_estimates_checked_at: new Date().toISOString(),
      })
      .eq("id", gameId);

    await page.goto(`/juegos/${gameId}`);

    const estimates = page.getByTestId("time-to-beat");
    await expect(estimates).toBeVisible();
    await expect(estimates.getByText(/estimado por IA/i)).toBeVisible();

    // El ícono del set reemplaza al ✨: un emoji se dibuja distinto en cada
    // sistema operativo y no toma el color del tema (issue #176 §3.3).
    await expect(estimates.locator('[data-icon="sparkle"]')).toBeVisible();
    await expect(estimates).not.toContainText("✨");
  });

  test("DS-05: los íconos decorativos no ensucian el árbol de accesibilidad", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Diseno Iconos A11y",
      np: 2102,
    });

    await supabase
      .from("games")
      .update({
        time_to_beat_minutes: 600,
        time_estimates_source: "ai",
        time_estimates_checked_at: new Date().toISOString(),
      })
      .eq("id", gameId);

    await page.goto(`/juegos/${gameId}`);

    // El ícono va al lado de un texto que ya dice lo mismo, así que tiene que
    // estar oculto para el lector de pantalla. Un emoji suelto, en cambio, se
    // lee en voz alta ("destellos") en medio de la frase.
    const icon = page.getByTestId("time-to-beat").locator('[data-icon="sparkle"]');
    await expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  test("DS-06: las primitivas pintan con los tokens y no con un color literal", async ({
    page,
  }) => {
    await page.goto("/login");

    // Lo que este test agarra es el modo de falla de la fase 2: los tokens
    // existen (DS-02 lo verifica) pero el componente los ignora y sigue con
    // `bg-blue-600`. Desde el diff se ven las dos cosas igual de bien; desde
    // el estilo computado, no.
    const submit = page.getByRole("button", { name: /ingresar/i });
    await expect(submit).toBeVisible();

    const colors = await submit.evaluate((el) => {
      const root = getComputedStyle(document.documentElement);
      // `color-mix`/hex del token vs. rgb() del computado: se normaliza
      // pintando el token en un elemento suelto y leyendo lo que resuelve.
      const probe = document.createElement("div");
      probe.style.backgroundColor = root.getPropertyValue("--accent").trim();
      document.body.appendChild(probe);
      const accent = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { button: getComputedStyle(el).backgroundColor, accent };
    });

    expect(colors.button).toBe(colors.accent);
  });

  test("DS-07: el badge de platino del póster es un ícono del set, no un emoji", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 4,
      nameSuffix: "Diseno Poster Platino",
      np: 2103,
    });

    // Los 4 trofeos, incluido el platino (el seed cicla bronce/plata/oro/
    // platino, así que el índice 3 es el platino).
    await supabase.from("user_trophies").upsert(
      trophyIds.map((trophyId) => ({
        user_id: users.userA.id,
        trophy_id: trophyId,
        unlocked_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,trophy_id" },
    );

    await page.goto(`/juegos?q=Diseno Poster Platino`);

    const card = page
      .getByTestId("game-card")
      .filter({ has: page.locator(`a[href$="${gameId}"]`) });
    await expect(card).toHaveCount(1);

    // El 🏆 que había acá se dibujaba distinto en cada sistema operativo y
    // traía su propio color, así que no seguía al tema (issue #176 §3.3).
    await expect(card.locator('[data-icon="trophy"]')).toBeVisible();
    await expect(card).not.toContainText("🏆");

    // El ícono ES la información -- no hay texto al lado que diga "Platino" --
    // así que acá sí se anuncia, al revés que el caso DS-05.
    await expect(card.getByRole("img", { name: "Platino" })).toBeVisible();
  });
});
