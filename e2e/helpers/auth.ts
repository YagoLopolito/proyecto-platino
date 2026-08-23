import type { SupabaseClient } from "@supabase/supabase-js";
import { TEST_PASSWORD, testEmail } from "./ids";

export type TestUser = { id: string; email: string; password: string };

/**
 * Crea un usuario ya confirmado. Se hace con service role a proposito: el
 * signup normal puede exigir confirmacion por mail y los tests no leen mails
 * (TESTING_PRD.md restriccion R5).
 */
export async function createTestUser(supabase: SupabaseClient, suffix: string): Promise<TestUser> {
  const email = testEmail(suffix);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear el usuario de test ${email}: ${error?.message}`);
  }
  return { id: data.user.id, email, password: TEST_PASSWORD };
}

export async function deleteTestUser(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.auth.admin.deleteUser(userId);
}
