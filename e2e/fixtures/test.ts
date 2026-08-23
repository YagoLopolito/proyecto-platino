import { test as base, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { createTestServiceClient } from "../helpers/supabase";
import type { TestUser } from "../helpers/auth";

type RunInfo = { runId: string; userA: TestUser; userB: TestUser };

type Fixtures = {
  /** Cliente service role para seedear y verificar filas directo en la base. */
  supabase: SupabaseClient;
  /** Usuarios creados en el global-setup. */
  users: RunInfo;
};

function readRunInfo(): RunInfo {
  const file = path.join(process.cwd(), "e2e", ".auth", "users.json");
  if (!fs.existsSync(file)) {
    throw new Error("Falta e2e/.auth/users.json. Corriste los tests sin el global-setup?");
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as RunInfo;
}

export const test = base.extend<Fixtures>({
  supabase: async ({}, use) => {
    await use(createTestServiceClient());
  },
  users: async ({}, use) => {
    await use(readRunInfo());
  },
});

export { expect };
