// Corre solo los tests @live con las integraciones reales (sin E2E_MOCKS).
// Existe como script de node para setear la env var de forma cross-platform.
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "test", "--grep", "@live", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, E2E_LIVE: "1", E2E_MOCKS: "0" } },
);
process.exit(result.status ?? 1);
