import fs from "node:fs";
import path from "node:path";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { createTestUserClient } from "../helpers/supabase";
import { createTestUser } from "../helpers/auth";
import { testGameCommId } from "../helpers/ids";
import { buildContentSecurityPolicy } from "../../lib/security/csp";
import { TROPHY_HINT_LIMITS, slidingWindowRemainingMs } from "../../lib/sync/cooldown";

/**
 * Endurecimiento de la columna Ready del proyecto de seguridad: guías de sólo
 * lectura (#160), catálogo no editable por `authenticated` (#164), errores de
 * la base fuera de las respuestas (#165), CSP con nonce (#222) y freno de la
 * ayuda de trofeo con IA (#235). Casos SEC-08..SEC-12 y AI-18 de
 * TESTING_PRD.md. Los de RLS van con clientes logueados: con service role
 * todo pasa y una policy de más no se ve.
 */
test.describe("Guías de sólo lectura (#160)", () => {
  test("SEC-08: nadie con sesión escribe guías ni pasos", async ({ supabase, users }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Guias RO ${users.runId}`,
      np: 3801,
    });
    const asB = await createTestUserClient(users.userB.email, users.userB.password);

    const { data: inserted } = await asB
      .from("guides")
      .insert({
        game_id: gameId,
        author_id: users.userB.id,
        title: "[E2E] Guía oficial del platino",
        external_url: "https://example.com/phishing",
      })
      .select("id");
    expect(inserted ?? []).toEqual([]);

    // Una guía que ya existe (de antes de la migración) tampoco la puede
    // editar ni su autor.
    const { data: guide } = await supabase
      .from("guides")
      .insert({ game_id: gameId, author_id: users.userB.id, title: "[E2E] Guía vieja" })
      .select("id")
      .single();
    const { data: updated } = await asB
      .from("guides")
      .update({ external_url: "https://example.com/phishing" })
      .eq("id", guide!.id)
      .select("id");
    expect(updated ?? []).toEqual([]);
    const { data: step } = await asB
      .from("guide_steps")
      .insert({ guide_id: guide!.id, step_order: 1, content: "[E2E] paso" })
      .select("id");
    expect(step ?? []).toEqual([]);

    const { count } = await supabase
      .from("guides")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);
    expect(count).toBe(1);
  });
});

test.describe("Catálogo compartido (#164)", () => {
  test("SEC-09: ni quien sincronizó el juego lo renombra, lo borra ni toca sus trofeos", async ({
    supabase,
    users,
  }) => {
    // userA lo "sincronizó" (created_by) y los dos lo tienen en la biblioteca.
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 2,
      nameSuffix: `Catalogo RO ${users.runId}`,
      np: 3802,
    });
    await supabase
      .from("user_games")
      .upsert({ user_id: users.userB.id, game_id: gameId }, { onConflict: "user_id,game_id" });

    for (const user of [users.userA, users.userB]) {
      const client = await createTestUserClient(user.email, user.password);
      const { data: renamed } = await client
        .from("games")
        .update({ name: "[E2E] vandalizado" })
        .eq("id", gameId)
        .select("id");
      expect(renamed ?? []).toEqual([]);
      const { data: deleted } = await client.from("games").delete().eq("id", gameId).select("id");
      expect(deleted ?? []).toEqual([]);
      const { data: trophy } = await client
        .from("trophies")
        .update({ name: "[E2E] vandalizado" })
        .eq("id", trophyIds[0])
        .select("id");
      expect(trophy ?? []).toEqual([]);
      const { data: trophyDeleted } = await client
        .from("trophies")
        .delete()
        .eq("id", trophyIds[0])
        .select("id");
      expect(trophyDeleted ?? []).toEqual([]);
    }

    const { data: game } = await supabase.from("games").select("name").eq("id", gameId).single();
    expect(game?.name).not.toContain("vandalizado");
    const { count } = await supabase
      .from("trophies")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);
    expect(count).toBe(2);
  });

  test("SEC-09b: con sesión sólo se da de alta un juego de catálogo, nunca uno de PSN o Steam", async ({
    supabase,
    users,
  }) => {
    const asB = await createTestUserClient(users.userB.email, users.userB.password);
    // Ocupar el np_comm_id antes que el sync le dejaba elegir el nombre del
    // juego que después ven todos.
    const { data: squatted } = await asB
      .from("games")
      .insert({
        np_comm_id: testGameCommId(3803),
        name: "[E2E] juego ocupado",
        created_by: users.userB.id,
        source: "psn",
      })
      .select("id");
    expect(squatted ?? []).toEqual([]);
    const { data: catalog } = await asB
      .from("games")
      .insert({
        np_comm_id: testGameCommId(3804),
        name: "[E2E] catálogo con np",
        created_by: users.userB.id,
        source: "catalog",
      })
      .select("id");
    expect(catalog ?? []).toEqual([]);
    // Trofeos tampoco: los escribe sólo el sync.
    const { gameId } = await seedGameWithTrophies(supabase, users.userB.id, {
      n: 1,
      nameSuffix: `Catalogo Trofeos ${users.runId}`,
      np: 3806,
    });
    const { data: trophies } = await asB
      .from("trophies")
      .insert({
        game_id: gameId,
        trophy_id: "e2e-extra",
        name: "[E2E] trofeo inventado",
        type: "bronze",
        created_by: users.userB.id,
      })
      .select("id");
    expect(trophies ?? []).toEqual([]);
  });
});

test.describe("Errores de la base (#165)", () => {
  test("SEC-10: ningún mensaje crudo de la base se arma en una respuesta", () => {
    // El equivalente al `grep` del DoD, para que no vuelva: un
    // `${error.message}` en un template de app/, components/ o lib/ es un
    // error de Postgres camino al cliente. Los `console.*` son logs del
    // server y quedan afuera.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          fs.readFileSync(full, "utf8")
            .split("\n")
            .forEach((line, i) => {
              if (/\$\{\w*[eE]rror\??\.message\}/.test(line) && !/console\./.test(line)) {
                offenders.push(`${full}:${i + 1}`);
              }
            });
        }
      }
    };
    for (const dir of ["app", "components", "lib"]) walk(path.join(process.cwd(), dir));
    expect(offenders).toEqual([]);
  });
});

test.describe("Content-Security-Policy (#222)", () => {
  test("SEC-11: la CSP lleva un nonce por request y todos los scripts lo tienen", async ({
    request,
  }) => {
    const nonces: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await request.get("/biblioteca");
      expect(res.ok()).toBe(true);
      const csp = res.headers()["content-security-policy"];
      expect(csp).toBeTruthy();
      const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"))!;
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).toContain("'strict-dynamic'");
      const nonce = /'nonce-([^']+)'/.exec(scriptSrc)?.[1];
      expect(nonce).toBeTruthy();
      nonces.push(nonce!);

      const html = await res.text();
      const scripts = html.match(/<script\b[^>]*>/g) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
    }
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  test("SEC-11b: la app carga e hidrata sin violaciones de CSP", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Content-Security-Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    await page.goto("/biblioteca");
    // Un botón que sólo funciona hidratado: si la CSP bloqueara los scripts
    // de Next, el menú de la cuenta no abriría.
    await page.getByRole("button", { name: "Cuenta" }).click();
    await expect(page.getByRole("menuitem", { name: "Configuración" })).toBeVisible();
    await page.goto("/offline");
    expect(violations).toEqual([]);
  });

  test("SEC-11c: la política no relaja lo que importa", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc",
      isDev: false,
      supabaseUrl: "https://xyz.supabase.co",
    });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://xyz.supabase.co wss://xyz.supabase.co");
    // En desarrollo React necesita eval para los stacks; nunca en producción.
    expect(buildContentSecurityPolicy({ nonce: "abc", isDev: true })).toContain("'unsafe-eval'");
  });
});

test.describe("Freno de la ayuda de trofeo (#235)", () => {
  test("SEC-12: la ventana deslizante cuenta cada tope por separado", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    const at = (msAgo: number) => new Date(now - msAgo).toISOString();
    // 9 en el último minuto: entra uno más.
    expect(
      slidingWindowRemainingMs(
        Array.from({ length: 9 }, () => at(1_000)),
        TROPHY_HINT_LIMITS,
        now,
      ),
    ).toBe(0);
    // 10 en el último minuto, el más viejo hace 20 s: faltan 40 s.
    const tenInAMinute = [...Array.from({ length: 9 }, () => at(1_000)), at(20_000)];
    expect(slidingWindowRemainingMs(tenInAMinute, TROPHY_HINT_LIMITS, now)).toBe(40_000);
    // 100 en el día, ninguno en el último minuto: frena el diario.
    const hundredToday = Array.from({ length: 100 }, (_, i) => at(2 * 60_000 + i * 60_000));
    expect(slidingWindowRemainingMs(hundredToday, TROPHY_HINT_LIMITS, now)).toBeGreaterThan(0);
  });

  test("AI-18: pasado el tope, la ayuda de un trofeo avisa sin llamar al proveedor", async ({
    browser,
    supabase,
    users,
  }) => {
    // Un usuario propio: los topes son por usuario, y llenar el de userA
    // frenaría las ayudas de los otros specs que corren en paralelo.
    const user = await createTestUser(supabase, `hint-limit-${users.runId}`);
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, user.id, {
      n: 1,
      nameSuffix: `Ayuda Freno ${users.runId}`,
      np: 3805,
    });
    const limit = TROPHY_HINT_LIMITS[0];
    await supabase
      .from("ai_usage")
      .insert(Array.from({ length: limit.max }, () => ({ user_id: user.id, kind: "trophy_hint" })));

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(user.email);
      await page.getByLabel(/contrase/i).fill(user.password);
      await page.getByRole("button", { name: /ingresar/i }).click();
      await expect(page).toHaveURL(/\/perfil/);

      await page.goto(`/juegos/${gameId}`);
      const row = page.locator(`#trofeo-${trophyIds[0]}`);
      await row.getByRole("button", { name: "Cómo desbloquearlo" }).click();
      await expect(row.getByText(/Pediste muchas ayudas seguidas/)).toBeVisible();
      await expect(row.getByText(/\[E2E\] Ayuda mockeada/)).toHaveCount(0);

      // El pedido frenado no se anota: si contara, el freno se estiraría solo.
      const { count } = await supabase
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      expect(count).toBe(limit.max);
    } finally {
      await context.close();
    }
  });
});
