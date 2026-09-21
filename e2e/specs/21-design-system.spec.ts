import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sistema de diseño: tokens, escala tipográfica y set de íconos.
 * Casos DS-01..DS-20 de TESTING_PRD.md §6.18 (fases 1 a 5 del issue #176).
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

  test("DS-08: el nombre del juego en la ficha se renderiza en la serif editorial", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Diseno Serif Hero",
      np: 2104,
    });

    await page.goto(`/juegos/${gameId}`);

    // El contraste serif/sans es la mitad de la identidad de la referencia
    // (issue #176 §3.2), y el nombre del juego es el único texto editorial de
    // esta pantalla. Con las clases del JSX esto no se ve: `type-display`
    // puede estar puesta y no compilar, y el título cae a la sans heredada.
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();

    const fonts = await heading.evaluate((el) => ({
      name: getComputedStyle(el.querySelector("span")!).fontFamily,
      meta: getComputedStyle(document.body).fontFamily,
    }));
    expect(fonts.name).toMatch(SERIF);
    // Y el resto de la app sigue en la sans: si las dos resolvieran a lo
    // mismo, el contraste que justifica cargar dos familias no existe.
    expect(fonts.meta).toMatch(SANS);
  });

  test("DS-09: la nav de secciones de la ficha usa íconos del set, no emojis", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Diseno Nav Ficha",
      np: 2105,
    });

    await page.goto(`/juegos/${gameId}`);

    const nav = page.getByRole("link", { name: /Enlaces/ }).locator("xpath=..");
    for (const icon of ["trophy", "sparkle", "link", "book"]) {
      await expect(nav.locator(`[data-icon="${icon}"]`)).toBeVisible();
    }
    // Los cuatro emojis que encabezaban las secciones (issue #176 §3.3).
    for (const emoji of ["🏆", "✨", "🔗", "📔"]) {
      await expect(nav).not.toContainText(emoji);
    }
  });

  test("DS-10: la lista de trofeos son filas con hairline, no tarjetas", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 3,
      nameSuffix: "Diseno Filas Trofeo",
      np: 2106,
    });

    await page.goto(`/juegos/${gameId}`);

    const row = page.getByRole("listitem").filter({ hasText: "Trofeo 1" }).first();
    await expect(row).toBeVisible();

    const box = await row.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        borderBottom: parseFloat(s.borderBottomWidth),
        borderTop: parseFloat(s.borderTopWidth),
        radius: parseFloat(s.borderTopLeftRadius),
      };
    });

    // Con 50 trofeos en pantalla, 50 marcos de 1px compiten entre sí y ninguno
    // gana (issue #176 §4): la fila no tiene fondo propio ni esquinas
    // redondeadas, sólo el hairline que la separa de la de abajo.
    expect(box.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(box.borderBottom).toBeCloseTo(1, 1);
    expect(box.borderTop).toBe(0);
    expect(box.radius).toBe(0);
  });

  test("DS-11: la rareza de un trofeo pinta con los tokens de rareza", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: "Diseno Rareza",
      np: 2107,
    });

    // Rareza 0 = ultra rara, el escalón que tiene token propio.
    await supabase.from("trophies").update({ rarity: 0 }).eq("id", trophyIds[0]);

    await page.goto(`/juegos/${gameId}`);

    // Acotado a la fila del trofeo: suelto, `getByText("Ultra rara")` pegaba
    // primero en el `<option>` del filtro de rareza, que está en el DOM pero
    // oculto dentro del `<select>` cerrado.
    const chip = page
      .getByRole("listitem")
      .filter({ hasText: "Diseno Rareza - Trofeo 1" })
      .getByText("Ultra rara");
    await expect(chip).toBeVisible();

    const colors = await chip.evaluate((el) => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("div");
      probe.style.color = root.getPropertyValue("--rarity-ultra").trim();
      document.body.appendChild(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      return { chip: getComputedStyle(el).color, token };
    });

    // Antes era `text-fuchsia-300` a mano: el mismo modo de falla que DS-06,
    // un color parecido que no sale de ningún token.
    expect(colors.chip).toBe(colors.token);
  });

  /**
   * Una entrada de diario con reseña, que es lo que hace falta para los casos
   * de la fase 4: el diario es la pantalla donde la serif de lectura tiene que
   * aparecer y donde el rating se dibuja con estrellas.
   */
  async function seedDiaryEntry(
    supabase: SupabaseClient,
    userId: string,
    gameId: string,
    review: string,
  ) {
    await supabase.from("game_diary_entries").upsert(
      {
        user_id: userId,
        game_id: gameId,
        playthrough_number: 1,
        rating: 9,
        review,
        finished_on: "2026-05-04",
      },
      { onConflict: "user_id,game_id,playthrough_number" },
    );
  }

  test("DS-12: la reseña del diario se renderiza en la serif de lectura", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Diseno Resena Serif",
      np: 2108,
    });
    const review = "[E2E] Resena en serif de lectura";
    await seedDiaryEntry(supabase, users.userA.id, gameId, review);

    await page.goto(`/juegos/${gameId}/diario`);

    // La reseña es el otro texto editorial de la app, junto con el nombre del
    // juego (issue #176 §3.2): si cae a la sans, el contraste que justifica
    // cargar dos familias desaparece justo en la pantalla que más lo necesita.
    const text = page.getByText(review).first();
    await expect(text).toBeVisible();
    expect(await text.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(SERIF);
  });

  test("DS-13: el rating del diario son íconos del set, no los glifos ★/☆", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Diseno Estrellas",
      np: 2109,
    });
    await seedDiaryEntry(supabase, users.userA.id, gameId, "[E2E] Resena con rating");

    await page.goto(`/juegos/${gameId}/diario`);

    // ★ y ☆ son dingbats: cada sistema los dibuja con su propia forma y su
    // propio ancho, así que las cinco estrellas no alineaban entre
    // dispositivos y el oro no salía del token.
    const rating = page.getByLabel("9/10").first();
    await expect(rating).toBeVisible();
    await expect(rating.locator('[data-icon="star"]')).toHaveCount(10);
    await expect(rating).not.toContainText("★");
    await expect(rating).not.toContainText("☆");
  });

  test("DS-14: las acciones del diario usan íconos del set, no emojis", async ({ page }) => {
    await page.goto("/diario");

    const actions = page.getByRole("link", { name: /Resumen del año/ }).locator("xpath=..");
    // Los cuatro emojis que encabezaban las acciones de la pantalla.
    for (const icon of ["chart", "camera", "trophy", "check"]) {
      await expect(actions.locator(`[data-icon="${icon}"]`).first()).toBeVisible();
    }
    for (const emoji of ["📊", "📷", "🏆", "✓"]) {
      await expect(actions).not.toContainText(emoji);
    }
  });

  test("DS-15: el nombre del juego en la ficha de diario va en la serif", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Diseno Hero Diario",
      np: 2110,
    });

    await page.goto(`/juegos/${gameId}/diario`);

    // `GameHero` es primo de `GameDetailHero` (DS-08) y tiene que leerse
    // igual: el nombre del juego es el texto editorial de la pantalla.
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    expect(await heading.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(SERIF);
  });

  test("DS-16: el tab activo del header se marca con acento, peso y aria-current", async ({
    page,
  }) => {
    await page.goto("/perfil");

    const nav = page.getByRole("navigation", { name: "Principal" });
    const active = nav.getByRole("link", { name: "Perfil" });
    await expect(active).toHaveAttribute("aria-current", "page");

    const styles = await active.evaluate((el) => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("div");
      probe.style.color = root.getPropertyValue("--accent-ink").trim();
      document.body.appendChild(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      const s = getComputedStyle(el);
      const inactive = getComputedStyle(el.parentElement!.querySelector('a:not([aria-current])')!);
      return {
        color: s.color,
        token,
        weight: parseInt(s.fontWeight, 10),
        inactiveWeight: parseInt(inactive.fontWeight, 10),
        textTransform: s.textTransform,
      };
    });

    // El activo no se distingue sólo por el color (WCAG 1.4.1): pesa más que
    // los otros. Y el color es el token, no un azul parecido.
    expect(styles.color).toBe(styles.token);
    expect(styles.weight).toBeGreaterThan(styles.inactiveWeight);
    // La nav es chrome en versalitas (issue #176 §4), no texto de lectura.
    expect(styles.textTransform).toBe("uppercase");
  });

  test("DS-17: la barra inferior de mobile dibuja sus tabs con íconos del set", async ({
    page,
  }) => {
    await page.goto("/perfil");

    // La barra está en el DOM en cualquier tamaño (es `sm:hidden`, no
    // condicional), así que se cuenta sin exigir visibilidad. Antes tenía sus
    // propios paths copiados a mano; ahora son los mismos íconos del set.
    const bar = page.getByTestId("mobile-tab-bar");
    await expect(bar.locator("[data-icon]")).toHaveCount(4);
    for (const icon of ["gamepad", "book", "user", "settings"]) {
      await expect(bar.locator(`[data-icon="${icon}"]`)).toHaveCount(1);
    }
  });

  test("DS-18: las instrucciones de Conexiones van plegadas y el campo queda a la vista", async ({
    page,
  }) => {
    await page.goto("/configuracion/conexiones");
    const psnCard = page.getByRole("region", { name: "PlayStation Network" });

    // Puede haber una cuenta PSN conectada por otro test de la corrida: en
    // ese caso el form vive detrás de "Reconectar con un NPSSO nuevo" y hay
    // que abrirlo primero. Lo que se prueba es el plegado de las
    // instrucciones, no el estado de la cuenta.
    const reconnect = psnCard.getByText("Reconectar con un NPSSO nuevo");
    if (await reconnect.count()) await reconnect.click();

    // El campo y el botón, siempre visibles: son la acción.
    await expect(psnCard.getByLabel("NPSSO")).toBeVisible();

    // El manual, plegado de entrada: el link a playstation.com está en el DOM
    // pero no se ve hasta abrir el `<details>`.
    const howTo = psnCard.getByText("Cómo conseguir el NPSSO");
    await expect(howTo).toBeVisible();
    const link = psnCard.getByRole("link", { name: "playstation.com" });
    await expect(link).toBeHidden();

    await howTo.click();
    await expect(link).toBeVisible();
  });

  test("DS-19: el chip de estado de una conexión pinta con el token semántico de su estado", async ({
    page,
  }) => {
    await page.goto("/configuracion/conexiones");

    // No se asume el estado de la cuenta (otro test de la corrida puede
    // haberla conectado): se lee `data-status` y se verifica que el color sea
    // exactamente el token que le corresponde a ESE estado.
    const chip = page
      .getByRole("region", { name: "PlayStation Network" })
      .getByTestId("connection-status");
    await expect(chip).toBeVisible();

    const colors = await chip.evaluate((el) => {
      const tokenByStatus: Record<string, string> = {
        connected: "--success",
        attention: "--warning",
        disconnected: "--ink-muted",
      };
      const status = el.getAttribute("data-status") ?? "";
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("div");
      probe.style.color = root.getPropertyValue(tokenByStatus[status]).trim();
      document.body.appendChild(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      return { chip: getComputedStyle(el).color, token, status };
    });

    expect(colors.chip).toBe(colors.token);
  });

  test("DS-20: la pantalla offline usa un ícono del set, no un emoji", async ({ browser }) => {
    // Sin sesión, igual que PWA-04: el fallback del service worker se sirve
    // antes de que haya usuario.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/offline");

    const main = page.getByRole("main");
    await expect(main.locator('[data-icon="offline"]')).toBeVisible();
    await expect(main).not.toContainText("📡");
    await context.close();
  });
});
