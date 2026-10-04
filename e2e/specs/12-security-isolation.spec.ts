import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * SEC-06 (issue #129): sin sesión, la anon key (que viaja en el bundle público)
 * no puede leer ninguna tabla. Las policies de select van `to authenticated`;
 * antes, sin rol explícito, aplicaban a PUBLIC y `anon` se bajaba todo.
 *
 * Va con cliente de supabase-js y no por la UI: lo que se prueba es la RLS, y
 * la UI ya está detrás del middleware.
 */
const TABLES = [
  "games",
  "trophies",
  "trophy_groups",
  "guides",
  "guide_steps",
  "game_external_guides",
  "game_diary_entries",
  // Galería online: ni las publicaciones ni sus archivos, likes o comentarios.
  "posts",
  "post_media",
  "post_likes",
  "post_comments",
  "user_favorite_games",
  "now_playing",
  "user_playlist",
  "review_likes",
  "companies",
  "game_companies",
  "user_lists",
  "user_list_items",
  "list_likes",
];

test.describe("RLS sin sesión", () => {
  for (const table of TABLES) {
    test(`SEC-06: la anon key no lee ${table}`, async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      expect(url && anonKey, "faltan las variables de Supabase").toBeTruthy();
      const anon = createClient(url!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await anon.from(table).select("*").limit(1);
      // Sin policy para `anon`, PostgREST devuelve una lista vacía (o un error
      // de permisos); nunca filas.
      expect(error ? [] : data).toEqual([]);
    });
  }
});
