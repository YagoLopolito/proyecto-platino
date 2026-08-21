"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { searchCatalogGames } from "@/lib/covers";
import { dedupeAndFlag, type CombinedSearchResult } from "@/lib/catalog/dedup";

export type SearchCatalogOutcome =
  | { status: "ok"; results: CombinedSearchResult[] }
  | { status: "missing_api_key"; results: CombinedSearchResult[] }
  | { status: "error"; message: string };

/**
 * Combina juegos ya existentes en `games` (por nombre) con resultados de
 * `lib/covers` (RAWG), deduplicados. Si falta RAWG_API_KEY, igual devuelve los
 * resultados de biblioteca local y propaga el status para que la UI avise en
 * vez de fallar en silencio.
 */
export async function searchCatalog(query: string): Promise<SearchCatalogOutcome> {
  const parsed = z.string().trim().min(2).max(100).safeParse(query);
  if (!parsed.success) {
    return { status: "ok", results: [] };
  }

  const supabase = await createClient();
  const { data: existingGames } = await supabase
    .from("games")
    .select("id, name, cover_url")
    .ilike("name", `%${parsed.data}%`)
    .limit(20);

  const libraryResults: CombinedSearchResult[] = (existingGames ?? []).map((game) => ({
    source: "library",
    gameId: game.id,
    name: game.name,
    coverUrl: game.cover_url,
  }));

  const catalogOutcome = await searchCatalogGames(parsed.data);
  if (catalogOutcome.status === "missing_api_key") {
    return { status: "missing_api_key", results: libraryResults };
  }
  if (catalogOutcome.status === "error") {
    return { status: "error", message: catalogOutcome.message };
  }

  const catalogResults = dedupeAndFlag(catalogOutcome.results, existingGames ?? []);
  return { status: "ok", results: [...libraryResults, ...catalogResults] };
}

export interface AddCatalogGameState {
  error: string | null;
  success?: string | null;
  gameId?: string;
}

const addCatalogGameSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().trim().min(1),
  coverUrl: z.string().url().nullable(),
  confirmedDuplicateOfGameId: z.string().uuid().nullable(),
});

/**
 * Da de alta un juego elegido en la búsqueda de catálogo: si el usuario
 * confirmó que es el mismo juego que uno existente (remaster/remake), lo
 * vincula a ese `game_id` en vez de crear una fila nueva. Si no, inserta en
 * `games` con source='catalog' (respeta games_insert_authenticated, sin RLS
 * nueva) y siempre vincula en user_games si todavía no estaba.
 */
export async function addCatalogGame(
  _prevState: AddCatalogGameState,
  formData: FormData,
): Promise<AddCatalogGameState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const parsed = addCatalogGameSchema.safeParse({
    externalId: formData.get("externalId"),
    name: formData.get("name"),
    coverUrl: formData.get("coverUrl") || null,
    confirmedDuplicateOfGameId: formData.get("confirmedDuplicateOfGameId") || null,
  });
  if (!parsed.success) {
    return { error: "Datos inválidos." };
  }

  let gameId: string;
  if (parsed.data.confirmedDuplicateOfGameId) {
    gameId = parsed.data.confirmedDuplicateOfGameId;
  } else {
    const { data: inserted, error } = await supabase
      .from("games")
      .insert({
        name: parsed.data.name,
        cover_url: parsed.data.coverUrl,
        source: "catalog",
        external_catalog_id: parsed.data.externalId,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return { error: "No se pudo crear el juego." };
    }
    gameId = inserted.id;
  }

  const { error: linkError } = await supabase
    .from("user_games")
    .upsert(
      { user_id: user.id, game_id: gameId },
      { onConflict: "user_id,game_id", ignoreDuplicates: true },
    );
  if (linkError) {
    return { error: "El juego se creó pero no se pudo agregar a tu biblioteca." };
  }

  return { error: null, success: `"${parsed.data.name}" agregado.`, gameId };
}
