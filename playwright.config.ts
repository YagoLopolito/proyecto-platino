import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Las credenciales de test salen de .env.test.local (gitignoreado) y, si no,
// del .env.local de desarrollo. Ver TESTING_PRD.md secciones 3 y 4.
loadEnv({ path: ".env.test.local", quiet: true });
loadEnv({ path: ".env.local", quiet: true });

const isCI = !!process.env.CI;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const isRemote = !baseURL.includes("localhost");
const authFile = "e2e/.auth/user-a.json";
const authFileB = "e2e/.auth/user-b.json";

export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Los @live salen a las APIs reales (PSN, Groq, RAWG, Steam): pueden fallar
  // por causas externas, asi que quedan fuera de la corrida por defecto y se
  // piden explicitamente con `npm run e2e:live`.
  grepInvert: process.env.E2E_LIVE === "1" ? undefined : /@live/,
  workers: isCI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  // El setup/teardown crean y destruyen los usuarios de test. Se saltean cuando
  // corremos el smoke contra un deploy remoto: ahí no se escribe nada.
  globalSetup: isRemote ? undefined : "./e2e/global-setup.ts",
  globalTeardown: isRemote ? undefined : "./e2e/global-teardown.ts",

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  },

  projects: [
    {
      // Sin sesión: login, registro, redirects de rutas protegidas.
      name: "anon",
      testMatch: /(01-auth|12-security-isolation)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // El grueso de la suite, ya logueado como userA.
      name: "authed",
      testIgnore:
        /(01-auth|03-sync-library|11-a11y-mobile|12-security-isolation|36-posts-mobile|smoke)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: authFile },
    },
    {
      // `03-sync-library` va sobre userB: conecta y desconecta `psn_accounts`
      // todo el tiempo, y `02-psn-connect`/`13-steam` hacen lo mismo sobre
      // userA en el worker de al lado. Con `fullyParallel` y usuarios
      // compartidos se pisaban entre archivos (la serialización de
      // `describe.serial` es intra-archivo, no entre archivos).
      name: "authed-b",
      testMatch: /03-sync-library\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: authFileB },
    },
    {
      name: "mobile",
      // La Galería online (36-posts-mobile) se prueba también en viewport de
      // celular: doble tap, swipe y el compositor a pantalla completa.
      testMatch: /(11-a11y-mobile|36-posts-mobile)\.spec\.ts/,
      use: { ...devices["Pixel 7"], storageState: authFile },
    },
    {
      // Contra Vercel: sin sesión, sin escrituras, sin mocks.
      name: "smoke",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Contra un deploy remoto no levantamos nada local.
  webServer: isRemote
    ? undefined
    : {
        command: isCI ? "npm run start" : "npm run dev",
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        env: { E2E_MOCKS: "1" },
      },
});

export { authFile, authFileB };
