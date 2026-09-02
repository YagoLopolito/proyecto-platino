import type { SupabaseClient } from "@supabase/supabase-js";
import { testGameCommId, testGameTitle } from "./ids";

/**
 * Seedea un juego `[E2E]` de catálogo compartido con `n` trofeos (bronce,
 * plata, oro, platino en orden, repitiendo el ciclo), lo vincula a un usuario
 * en `user_games`, y devuelve los ids para que el spec desbloquee lo que
 * necesite en `user_trophies`. Usa el cliente service role: es más rápido y
 * más determinista que pasar por el sync mockeado cuando el test no necesita
 * ejercitar el sync en sí (GAME-*, GUIDE-*, AI-*, LINK-*).
 *
 * Es **idempotente** (upsert, no insert): un corte de red contra Supabase
 * puede dejar el juego creado y hacer fallar el seed a mitad de camino, y con
 * `insert` los reintentos de Playwright morían todos con
 * `games_np_comm_id_key` -- el flake de red se convertía en un test rojo que
 * no se recuperaba nunca.
 */
export async function seedGameWithTrophies(
  supabase: SupabaseClient,
  ownerId: string,
  opts: { n: number; nameSuffix: string; np: number },
): Promise<{ gameId: string; trophyIds: string[] }> {
  const TYPES = ["bronze", "silver", "gold", "platinum"] as const;

  const { data: game, error: gameError } = await supabase
    .from("games")
    .upsert(
      {
        np_comm_id: testGameCommId(opts.np),
        name: testGameTitle(opts.nameSuffix),
        platform: "PS5",
        created_by: ownerId,
        source: "psn",
      },
      { onConflict: "np_comm_id" },
    )
    .select("id")
    .single();
  if (gameError || !game) {
    throw new Error(`No se pudo seedear el juego de test: ${gameError?.message}`);
  }

  const trophyRows = Array.from({ length: opts.n }, (_, i) => ({
    game_id: game.id,
    trophy_id: `t${i + 1}`,
    name: `${testGameTitle(opts.nameSuffix)} - Trofeo ${i + 1}`,
    description: `Trofeo de prueba ${i + 1}.`,
    type: TYPES[i % TYPES.length],
    hidden: false,
    sort_order: i,
    created_by: ownerId,
  }));

  const { data: trophies, error: trophiesError } = await supabase
    .from("trophies")
    .upsert(trophyRows, { onConflict: "game_id,trophy_id" })
    .select("id");
  if (trophiesError || !trophies) {
    throw new Error(`No se pudieron seedear los trofeos de test: ${trophiesError?.message}`);
  }

  await supabase.from("user_games").upsert(
    { user_id: ownerId, game_id: game.id },
    { onConflict: "user_id,game_id" },
  );

  return { gameId: game.id, trophyIds: trophies.map((t) => t.id) };
}
