import { createTestServiceClient, cleanupTestData } from "./helpers/supabase";

/**
 * Corre siempre, incluso con la suite en rojo: la base es la real del proyecto
 * y no puede quedar con basura de los tests (TESTING_PRD.md seccion 5.3).
 */
export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DATA === "1") {
    console.log("[e2e] E2E_KEEP_DATA=1: se conservan los datos de test.");
    return;
  }
  const supabase = createTestServiceClient();
  await cleanupTestData(supabase);
}
