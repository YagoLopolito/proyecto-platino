import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { mapWithConcurrency } from "@/lib/psn/concurrency";
import { resolveIgdbGame, type IgdbGameLookup } from "@/lib/igdb";
import { syncGameCompanies } from "./store";

/**
 * Estudios de los juegos que ya estaban en la base antes del issue #193 (los
 * nuevos se completan solos al abrir su ficha). Lo dispara
 * `scripts/backfill-companies.mjs` por tandas vía `/api/cron/sync?paso=estudios`.
 *
 * IGDB permite 4 req/s y cada juego son hasta 2 (buscar + estudios): con 2 en
 * paralelo y una pausa por juego queda por debajo. Un 429 vuelve como
 * `unavailable` y no se cachea, así que el juego entra en la tanda siguiente.
 */
const CONCURRENCY = 2;
const PAUSE_MS = 600;

export async function backfillGameCompanies(
  supabase: SupabaseClient<Database>,
  batchSize: number,
): Promise<{ processed: number; failed: number; pending: number }> {
  const { data: games } = await supabase
    .from("games")
    .select("id, name, igdb_id")
    .is("companies_checked_at", null)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  const results = await mapWithConcurrency(games ?? [], CONCURRENCY, async (game) => {
    const lookup: IgdbGameLookup =
      game.igdb_id !== null
        ? { status: "ok", id: game.igdb_id, name: game.name }
        : await resolveIgdbGame(game.name);
    const studios = await syncGameCompanies(game.id, lookup);
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    return studios !== null;
  });

  const { count } = await supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .is("companies_checked_at", null);

  return {
    processed: results.filter(Boolean).length,
    failed: results.filter((ok) => !ok).length,
    pending: count ?? 0,
  };
}
