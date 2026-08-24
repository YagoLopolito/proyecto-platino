import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createTestServiceClient, cleanupTestData } from "./helpers/supabase";
import { createTestUser } from "./helpers/auth";
import { getRunId } from "./helpers/ids";

const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");

/**
 * Crea los dos usuarios de test y guarda una sesion ya logueada por usuario,
 * para que los specs no tengan que pasar por el formulario de login cada vez
 * (TESTING_PRD.md seccion 3.2). El login se hace por UI a proposito: valida de
 * paso que el flujo real de cookies de Supabase SSR funciona.
 */
export default async function globalSetup(config: FullConfig) {
  const runId = getRunId();
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
  const supabase = createTestServiceClient();

  // Barrido defensivo: restos de una corrida anterior que no llego al teardown.
  await cleanupTestData(supabase);

  const userA = await createTestUser(supabase, "a");
  const userB = await createTestUser(supabase, "b");
  // userC es descartable: solo la usa AUTH-09 (logout). supabase.auth.signOut()
  // por defecto revoca el refresh token del lado del servidor (scope "global"),
  // asi que loguear y desloguear a userA/userB ahi invalidaria la storageState
  // compartida que el resto de la suite reutiliza para esos dos usuarios.
  const userC = await createTestUser(supabase, "c");

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(AUTH_DIR, "users.json"),
    JSON.stringify({ runId, userA, userB, userC }, null, 2),
  );

  const browser = await chromium.launch();
  try {
    for (const [file, user] of [
      ["user-a.json", userA],
      ["user-b.json", userB],
    ] as const) {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(user.email);
      await page.getByLabel(/contrase/i).fill(user.password);
      await page.getByRole("button", { name: /iniciar sesi|entrar|ingresar/i }).click();
      await page.waitForURL("**/perfil", { timeout: 30_000 });
      await context.storageState({ path: path.join(AUTH_DIR, file) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
