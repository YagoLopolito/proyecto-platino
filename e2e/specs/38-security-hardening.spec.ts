import fs from "node:fs";
import path from "node:path";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { createTestUserClient } from "../helpers/supabase";
import { createTestUser } from "../helpers/auth";
import { testGameCommId } from "../helpers/ids";
import { buildContentSecurityPolicy } from "../../lib/security/csp";
import { TROPHY_HINT_LIMITS } from "../../lib/sync/cooldown";

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
    // El equivalente al `grep` del DoD, para que no vuelva. Tres formas de
    // mandarle al cliente el mensaje de un error ajeno:
    // - `${error.message}` dentro de un template;
    // - `error: error.message` / `message: error.message` en un objeto;
    // - `cause instanceof Error ? cause.message : …`, que deja pasar CUALQUIER
    //   error (los propios se distinguen por su clase, no por `Error`).
    // Los `console.*` son logs del server y quedan afuera, igual que el
    // mensaje de una clase de error propia marcado con `// #165: mensaje
    // propio`. La tercera se busca sólo en `app/`: en `lib/` arma mensajes
    // para el log (IGDB, IA).
    const LEAKS: { pattern: RegExp; dirs: string[] }[] = [
      { pattern: /\$\{\w*[eE]rror\??\.message\}/, dirs: ["app", "components", "lib"] },
      {
        pattern: /\b(error|message):\s*\w*[eE]rror\??\.message\b/,
        dirs: ["app", "components", "lib"],
      },
      { pattern: /instanceof Error\s*\?\s*\w+\.message/, dirs: ["app"] },
    ];
    const offenders: string[] = [];
    const walk = (dir: string, pattern: RegExp) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, pattern);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const lines = fs.readFileSync(full, "utf8").split("\n");
          lines.forEach((line, i) => {
            if (!pattern.test(line)) return;
            // Un `console.*` de varias líneas, o un mensaje de un error propio
            // marcado a mano (`// #165: mensaje propio`), no van al cliente.
            const context = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
            // La marca va en la misma línea o en la anterior (prettier mueve
            // un comentario al final si la línea se pasa de largo).
            const marked = /#165: mensaje propio/.test(`${lines[i - 1] ?? ""}\n${line}`);
            if (/console\./.test(context) || marked) return;
            offenders.push(`${full}:${i + 1}`);
          });
        }
      }
    };
    for (const { pattern, dirs } of LEAKS) {
      for (const dir of dirs) walk(path.join(process.cwd(), dir), pattern);
    }
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

/**
 * Un usuario propio por test (y por intento): los topes son por usuario, y
 * llenar el de userA frenaría a los otros specs que corren en paralelo. El
 * número de intento va en el mail para que un reintento de Playwright no choque
 * con el usuario que dejó el intento anterior (lo barre el teardown).
 */
async function freshUser(supabase: Parameters<typeof createTestUser>[0], label: string) {
  const { runId } = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "e2e", ".auth", "users.json"), "utf8"),
  ) as { runId: string };
  return createTestUser(supabase, `${label}-${runId}-r${test.info().retry}`);
}

test.describe("Freno de la ayuda de trofeo (#235)", () => {
  test("SEC-12: claim_ai_usage cuenta y anota en un paso, aun en paralelo", async ({
    supabase,
  }) => {
    const user = await freshUser(supabase, "claim");
    const client = await createTestUserClient(user.email, user.password);
    const claim = () =>
      client.rpc("claim_ai_usage", {
        p_kind: "trophy_hint",
        p_window_seconds: [60],
        p_max: [3],
      });

    // Diez pedidos a la vez con un tope de 3: entran exactamente 3. Contado y
    // anotado por separado, los diez leían el mismo conteo y pasaban todos.
    const results = await Promise.all(Array.from({ length: 10 }, claim));
    for (const { error } of results) expect(error).toBeNull();
    const accepted = results.filter(({ data }) => data === 0);
    expect(accepted).toHaveLength(3);
    for (const { data } of results.filter(({ data }) => data !== 0)) {
      // Lo que falta es lo que le queda al más viejo de los tres en la ventana.
      expect(data).toBeGreaterThan(0);
      expect(data).toBeLessThanOrEqual(60_000);
    }
    const { count } = await supabase
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    expect(count).toBe(3);

    // Con sesión no se anota a mano (ni con otra fecha) ni se borra para
    // resetear el freno.
    const { data: inserted } = await client
      .from("ai_usage")
      .insert({ user_id: user.id, kind: "trophy_hint", created_at: "2000-01-01T00:00:00Z" })
      .select("id");
    expect(inserted ?? []).toEqual([]);
    const { data: deleted } = await client
      .from("ai_usage")
      .delete()
      .eq("user_id", user.id)
      .select("id");
    expect(deleted ?? []).toEqual([]);
  });

  test("SEC-12b: el cron borra las marcas de más de 2 días y deja las recientes", async ({
    request,
    supabase,
  }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, "Necesita CRON_SECRET.");
    const user = await freshUser(supabase, "aiclean");
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("ai_usage").insert([
      { user_id: user.id, kind: "trophy_hint", created_at: old },
      { user_id: user.id, kind: "trophy_hint" },
    ]);

    const response = await request.get("/api/cron/sync?paso=ia", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(response.ok()).toBe(true);
    expect((await response.json()).aiUsage.ok).toBe(true);

    const { data } = await supabase.from("ai_usage").select("created_at").eq("user_id", user.id);
    expect(data).toHaveLength(1);
    expect(Date.parse(data![0].created_at)).toBeGreaterThan(Date.parse(old));
  });

  test("AI-18: pasado el tope, la ayuda de un trofeo avisa sin llamar al proveedor", async ({
    browser,
    supabase,
    users,
  }) => {
    const user = await freshUser(supabase, "hint-limit");
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
