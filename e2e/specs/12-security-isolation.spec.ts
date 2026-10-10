import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createTestServiceClient } from "../helpers/supabase";
import { makePng } from "../helpers/posts";

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

/**
 * POST-36 (Galería online): sin sesión no se llega a una publicación ni a sus
 * archivos, ni siquiera con la URL directa del objeto del bucket privado.
 */
test.describe("Galería online sin sesión", () => {
  test("POST-36: /publicaciones/<id> redirige al login", async ({ page }) => {
    await page.goto("/publicaciones/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/actividad/galeria");
    await expect(page).toHaveURL(/\/login/);
  });

  test("POST-36b: la anon key no lista, firma ni baja archivos de post-media", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Un objeto real, subido con service role a una carpeta sin post.
    const service = createTestServiceClient();
    const path = `00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001/0-e2e.png`;
    await service.storage
      .from("post-media")
      .upload(path, makePng(16, 9), { contentType: "image/png", upsert: true });
    try {
      const { data: listed } = await anon.storage.from("post-media").list(path.split("/")[0]);
      expect(listed ?? []).toEqual([]);
      const { data: signed } = await anon.storage.from("post-media").createSignedUrl(path, 60);
      expect(signed).toBeNull();
      const { data: downloaded } = await anon.storage.from("post-media").download(path);
      expect(downloaded).toBeNull();
      // La URL "pública" tampoco sirve: el bucket es privado.
      const publicUrl = `${url}/storage/v1/object/public/post-media/${path}`;
      expect((await fetch(publicUrl)).ok).toBe(false);
    } finally {
      await service.storage.from("post-media").remove([path]);
    }
  });
});

/**
 * SEC-07 (issue #131): las respuestas llevan las cabeceras de seguridad, tanto
 * una página pública (`/login`) como el redirect al login del middleware
 * (`/biblioteca` sin sesión). La CSP no se chequea: queda para #222 (nonces).
 */
test.describe("Cabeceras de seguridad", () => {
  for (const path of ["/login", "/biblioteca"]) {
    test(`SEC-07: ${path} manda las cabeceras de seguridad`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      const headers = res.headers();
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["permissions-policy"]).toContain("geolocation=()");
    });
  }
});
