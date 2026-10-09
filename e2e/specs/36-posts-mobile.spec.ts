import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { makePng, seedPost } from "../helpers/posts";

/**
 * Galería online en viewport de celular (proyecto `mobile`, Pixel 7): doble
 * tap para el like, carrusel deslizable y el compositor a pantalla completa.
 * Casos POST-21..POST-23 y POST-28 de TESTING_PRD.md §6.28.
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

test("POST-28: en pantalla completa la foto se amplía con un pellizco y vuelve con doble toque", async ({
  page,
  supabase,
  users,
}) => {
  const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
    n: 1,
    nameSuffix: `Posts Pellizco ${users.runId}`,
    np: 3414,
  });
  const { postId } = await seedPost(supabase, { userId: users.userB.id, gameId });

  await page.goto(`/publicaciones/${postId}`);
  await page.getByRole("button", { name: "Ver en pantalla completa" }).click();
  const image = page.getByTestId("post-media-viewer").getByRole("img", { name: "Imagen 1 de 1" });
  await expect(image).toBeVisible();
  const area = image.locator("xpath=ancestor::*[@data-zoomed][1]");
  await expect(area).toHaveAttribute("data-zoomed", "false");

  // Playwright no tiene pellizco: se mandan los toques por CDP, como el
  // digitalizador del celular (dos dedos que se separan).
  const box = (await area.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const fingers = (gap: number) => [
    { x: cx - gap, y: cy, id: 1 },
    { x: cx + gap, y: cy, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(30) });
  for (const gap of [60, 90, 120, 150]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(gap) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(area).toHaveAttribute("data-zoomed", "true");

  // Doble toque: vuelve al tamaño original.
  await area.tap();
  await area.tap();
  await expect(area).toHaveAttribute("data-zoomed", "false");
});
