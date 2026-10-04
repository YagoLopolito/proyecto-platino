import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { makePng, seedPost } from "../helpers/posts";

/**
 * Galería online en viewport de celular (proyecto `mobile`, Pixel 7): doble
 * tap para el like, carrusel deslizable y el compositor a pantalla completa.
 * Casos POST-21..POST-23 de TESTING_PRD.md §6.28.
 */

test("POST-21: doble tap sobre la foto da me gusta, con el corazón animado", async ({
  page,
  supabase,
  users,
}) => {
  const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
    n: 1,
    nameSuffix: `Posts Doble Tap ${users.runId}`,
    np: 3411,
  });
  const { postId } = await seedPost(supabase, { userId: users.userB.id, gameId });

  await page.goto(`/publicaciones/${postId}`);
  const like = page.getByRole("button", { name: /Me gusta la publicación de/ });
  await expect(like).toHaveAttribute("aria-pressed", "false");

  await page.getByTestId("post-carousel").dblclick();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => {
      const { count } = await supabase
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", postId)
        .eq("user_id", users.userA.id);
      return count;
    })
    .toBe(1);
});

test("POST-22: el carrusel se desliza con snap y el contador sigue al archivo visible", async ({
  page,
  supabase,
  users,
}) => {
  const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
    n: 1,
    nameSuffix: `Posts Swipe ${users.runId}`,
    np: 3412,
  });
  const { postId } = await seedPost(supabase, { userId: users.userB.id, gameId, files: 2 });

  await page.goto(`/publicaciones/${postId}`);
  const counter = page.getByTestId("carousel-counter");
  await expect(counter).toHaveText("1/2");
  // Playwright no emula un swipe táctil: se desplaza el riel como lo haría el
  // dedo (scroll nativo con snap), que es lo que escucha el carrusel.
  await page
    .getByTestId("post-carousel")
    .locator("> div")
    .first()
    .evaluate((track) => track.scrollTo({ left: track.clientWidth }));
  await expect(counter).toHaveText("2/2");
  // Las flechas son de escritorio: en mobile no se muestran.
  await expect(page.getByRole("button", { name: "Archivo siguiente" })).toBeHidden();
});

test("POST-23: el compositor en mobile publica una foto", async ({ page, supabase, users }) => {
  const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
    n: 1,
    nameSuffix: `Posts Mobile ${users.runId}`,
    np: 3413,
  });
  await page.goto(`/publicaciones/nueva?juego=${gameId}`);
  await page
    .getByLabel(/Elegí fotos y videos/i)
    .setInputFiles([{ name: "celu.png", mimeType: "image/png", buffer: makePng(1080, 1920) }]);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page).toHaveURL(/\/publicaciones\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("post-detail")).toBeVisible();
});
