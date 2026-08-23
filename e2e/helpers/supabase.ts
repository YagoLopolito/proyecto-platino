import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_GAME_PREFIX, E2E_EMAIL_DOMAIN, E2E_STEAM_APPID_MIN } from "./ids";

/**
 * Cliente con service role para setup/teardown de los tests. Bypassea RLS,
 * asi que solo se usa desde el proceso de Playwright -- nunca desde la app.
 */
export function createTestServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. " +
        "Copialas a .env.test.local antes de correr los tests.",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Borra todo lo que dejo la suite: primero los usuarios de test (el cascade se
 * lleva psn_accounts, user_games, user_trophies, guides, diario y amigos), y
 * despues las filas de catalogo compartido, que no cuelgan de ningun usuario.
 *
 * Se llama tanto en el teardown como al inicio del setup, para barrer restos de
 * una corrida que se corto a la mitad.
 */
export async function cleanupTestData(supabase: SupabaseClient): Promise<void> {
  // El catalogo compartido primero: trophies/game_external_guides caen por
  // cascade desde games.
  await supabase.from("games").delete().like("np_comm_id", `${E2E_GAME_PREFIX}%`);
  // Los juegos que crea el sync mockeado de Steam no tienen np_comm_id: se
  // limpian por su rango reservado de appid.
  await supabase.from("games").delete().gte("steam_appid", E2E_STEAM_APPID_MIN);

  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const testUsers = (data?.users ?? []).filter((u) => u.email?.endsWith(`@${E2E_EMAIL_DOMAIN}`));
  for (const user of testUsers) {
    await supabase.auth.admin.deleteUser(user.id);
  }
}
