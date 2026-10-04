import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { createTestUserClient } from "../helpers/supabase";
import { createTestUser } from "../helpers/auth";
import { listPostObjects, makePng, seedPost } from "../helpers/posts";

/**
 * Galería online: publicar, feed, grilla, detalle, likes, comentarios,
 * notificaciones, editar y borrar. Casos POST-10..POST-26 de TESTING_PRD.md
 * §6.28 (los puros son POST-01..08, en 34-posts-units; mobile en 36).
 *
 * userA es la sesión del navegador. userB es "amigo" (A lo sigue) y userC no:
 * sus publicaciones se siembran con service role (`seedPost`).
 */

const png = (name: string, w = 320, h = 180) => ({
  name,
  mimeType: "image/png",
  buffer: makePng(w, h),
});

function fileInput(page: Page) {
  return page.getByLabel(/Elegí fotos y videos|elegilos de tu equipo/i);
}

/** Un WebM real de 1 s, grabado en el propio Chromium (sin fixtures binarios). */
async function recordWebm(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    const recorder = new MediaRecorder(canvas.captureStream(10), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.start();
    let frame = 0;
    const timer = setInterval(() => {
      context.fillStyle = `hsl(${frame++ * 40}, 80%, 50%)`;
      context.fillRect(0, 0, 320, 180);
    }, 100);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    recorder.stop();
    clearInterval(timer);
    await new Promise((resolve) => (recorder.onstop = resolve));
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

async function postIdFromUrl(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/publicaciones\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test.describe("Publicar", () => {
  test("POST-10: publicar una imagen la deja en el detalle, en calidad original", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Una ${users.runId}`,
      np: 3401,
    });
    await page.goto(`/publicaciones/nueva?juego=${gameId}`);
    await expect(page.getByTestId("post-selected-game")).toContainText("Posts Una");

    await fileInput(page).setInputFiles([png("captura.png", 1920, 1080)]);
    await page.getByLabel(/Descripción/).fill("[E2E] mi primera captura");
    await page.getByRole("button", { name: "Publicar", exact: true }).click();

    const postId = await postIdFromUrl(page);
    await expect(page.getByTestId("post-detail")).toContainText("mi primera captura");

    const { data: post } = await supabase
      .from("posts")
      .select("status, caption, post_media (position, width, height, mime_type, display_path)")
      .eq("id", postId)
      .single();
    expect(post?.status).toBe("published");
    expect(post?.post_media).toHaveLength(1);
    // El original conserva su tamaño; el feed usa un derivado aparte.
    expect(post?.post_media[0]).toMatchObject({
      width: 1920,
      height: 1080,
      mime_type: "image/png",
    });
    expect(post?.post_media[0].display_path).toMatch(/-display\.webp$/);
  });

  test("POST-11: carrusel mixto imagen + video, reordenado y con un archivo quitado", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Mixto ${users.runId}`,
      np: 3402,
    });
    await page.goto(`/publicaciones/nueva?juego=${gameId}`);
    const webm = await recordWebm(page);

    await fileInput(page).setInputFiles([
      png("a.png"),
      png("b.png"),
      { name: "clip.webm", mimeType: "video/webm", buffer: webm },
    ]);
    const items = page.getByTestId("post-composer-item");
    await expect(items).toHaveCount(3);
    await expect(page.getByText("Procesando…")).toHaveCount(0);

    // b.png pasa a ser la portada y a.png se quita.
    await page.getByRole("button", { name: "Mover b.png antes" }).click();
    await page.getByRole("button", { name: "Quitar a.png" }).click();
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute("data-filename", "b.png");
    await expect(items.nth(1)).toHaveAttribute("data-filename", "clip.webm");

    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    const postId = await postIdFromUrl(page);

    const { data: media } = await supabase
      .from("post_media")
      .select("position, media_type, poster_path")
      .eq("post_id", postId)
      .order("position");
    expect(media).toEqual([
      expect.objectContaining({ position: 0, media_type: "image", poster_path: null }),
      expect.objectContaining({ position: 1, media_type: "video" }),
    ]);
    expect(media?.[1].poster_path).toMatch(/-poster\.jpg$/);
  });

  test("POST-12: errores claros antes de subir", async ({ page }) => {
    await page.goto("/publicaciones/nueva");
    const publish = page.getByRole("button", { name: "Publicar", exact: true });

    // Sin archivos: no se puede publicar.
    await expect(publish).toBeDisabled();

    // Formato inválido (un texto con extensión .jpg), HEIC y uno demasiado grande.
    await fileInput(page).setInputFiles([
      { name: "trucho.jpg", mimeType: "image/jpeg", buffer: Buffer.from("hola mundo") },
      { name: "IMG_0001.heic", mimeType: "image/heic", buffer: Buffer.from("heic") },
      { name: "enorme.png", mimeType: "image/png", buffer: Buffer.alloc(21 * 1024 * 1024) },
    ]);
    await expect(page.getByText(/“trucho.jpg” no es realmente/)).toBeVisible();
    await expect(page.getByText(/Convertilas a JPG/)).toBeVisible();
    await expect(page.getByText(/máximo para una imagen es 20 MB/)).toBeVisible();
    await expect(publish).toBeDisabled();

    // Se quitan y se agrega uno válido: sin juego, el error lo pide.
    for (const name of ["trucho.jpg", "IMG_0001.heic", "enorme.png"]) {
      await page.getByRole("button", { name: `Quitar ${name}` }).click();
    }
    await fileInput(page).setInputFiles([png("ok.png")]);
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByText("Elegí de qué juego es la publicación.")).toBeVisible();

    // 11 archivos: entran 10 y se avisa.
    await page.getByRole("button", { name: "Quitar ok.png" }).click();
    await fileInput(page).setInputFiles(
      Array.from({ length: 11 }, (_, i) => png(`f${i}.png`, 32, 18)),
    );
    await expect(page.getByTestId("post-composer-item")).toHaveCount(10);
    await expect(page.getByText(/hasta 10 archivos/).first()).toBeVisible();
  });

  test("POST-13: si la red corta a mitad de la subida, se reintenta sólo ese archivo", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Red ${users.runId}`,
      np: 3403,
    });
    await page.goto(`/publicaciones/nueva?juego=${gameId}`);
    await fileInput(page).setInputFiles([png("caida.png")]);
    await expect(page.getByText("Procesando…")).toHaveCount(0);

    let failing = true;
    await page.route("**/storage/v1/upload/resumable**", (route) =>
      failing ? route.abort("internetdisconnected") : route.continue(),
    );
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByText(/No se pudo subir/).first()).toBeVisible({ timeout: 20_000 });

    failing = false;
    await page.getByRole("button", { name: "Reintentar caida.png" }).click();
    const postId = await postIdFromUrl(page);
    const { data } = await supabase.from("posts").select("status").eq("id", postId).single();
    expect(data?.status).toBe("published");
  });
});

test.describe("Feed, grilla y detalle", () => {
  test("POST-14: la Galería online muestra lo propio y lo de amigos; la grilla, lo de todos", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Feed ${users.runId}`,
      np: 3404,
    });
    await supabase
      .from("friendships")
      .upsert({ user_id: users.userA.id, friend_id: users.userB.id });
    const own = await seedPost(supabase, { userId: users.userA.id, gameId, caption: "propio" });
    const friend = await seedPost(supabase, { userId: users.userB.id, gameId, caption: "de B" });
    // Un usuario recién creado al que nadie sigue: userC no sirve, otros specs
    // hacen que userA lo siga.
    const strangerUser = await createTestUser(supabase, `posts-stranger-${users.runId}`);
    const stranger = await seedPost(supabase, {
      userId: strangerUser.id,
      gameId,
      caption: "de alguien que no seguís",
    });

    await page.goto("/actividad/galeria");
    await expect(page.getByRole("tab", { name: "Galería online" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const feed = page.getByTestId("gallery-feed");
    await expect(feed.locator(`[data-post-id="${own.postId}"]`)).toBeVisible();
    await expect(feed.locator(`[data-post-id="${friend.postId}"]`)).toBeVisible();
    await expect(feed.locator(`[data-post-id="${stranger.postId}"]`)).toHaveCount(0);

    // En la ficha del juego aparecen los de todos, también el de alguien que no seguís.
    await page.goto(`/juegos/${gameId}/capturas`);
    await expect(page.getByTestId("post-grid-cell")).toHaveCount(3);
  });

  test("POST-15: spoiler borroso en grilla, feed y detalle, hasta revelarlo", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Spoiler ${users.runId}`,
      np: 3405,
    });
    await supabase
      .from("friendships")
      .upsert({ user_id: users.userA.id, friend_id: users.userB.id });
    const { postId } = await seedPost(supabase, {
      userId: users.userB.id,
      gameId,
      isSpoiler: true,
    });

    await page.goto(`/juegos/${gameId}/capturas`);
    await expect(page.getByTestId("post-grid-cell")).toHaveAttribute("data-spoiler", "true");
    await expect(page.getByTestId("post-grid-cell")).toHaveAccessibleName(/contiene spoilers/);

    await page.goto("/actividad/galeria");
    const card = page.locator(`[data-post-id="${postId}"]`);
    const reveal = card.getByTestId("spoiler-reveal");
    await expect(reveal).toBeVisible();
    await reveal.click();
    await expect(reveal).toHaveCount(0);

    await page.goto(`/publicaciones/${postId}`);
    await expect(page.getByTestId("spoiler-reveal")).toBeVisible();
  });

  test("POST-16: carrusel con teclado en el detalle y Esc cierra el modal", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Carrusel ${users.runId}`,
      np: 3406,
    });
    const { postId } = await seedPost(supabase, { userId: users.userB.id, gameId, files: 3 });

    await page.goto(`/publicaciones/${postId}`);
    const counter = page.getByTestId("carousel-counter");
    await expect(counter).toHaveText("1/3");
    // "1/3" ya viene en el HTML del server: una tecla apretada antes de que
    // React hidrate se pierde. La primera se reintenta hasta que la página la
    // escucha; las siguientes ya van sobre la página hidratada.
    await expect(async () => {
      await page.keyboard.press("ArrowRight");
      await expect(counter).toHaveText("2/3", { timeout: 1_000 });
    }).toPass();
    await page.keyboard.press("ArrowRight");
    await expect(counter).toHaveText("3/3");
    await page.keyboard.press("ArrowLeft");
    await expect(counter).toHaveText("2/3");

    // Desde la grilla, el detalle se abre en un modal con su propia URL.
    await page.goto(`/juegos/${gameId}/capturas`);
    await page.getByTestId("post-grid-cell").click();
    await expect(page).toHaveURL(new RegExp(`/publicaciones/${postId}$`));
    const dialog = page.getByRole("dialog", { name: "Publicación" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/juegos/${gameId}/capturas$`));
  });

  test("POST-17: paginación numerada, recarga en ?page=N y atrás", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Paginas ${users.runId}`,
      np: 3407,
    });
    // 46 publicaciones: la grilla muestra 45 por página.
    for (let batch = 0; batch < 46; batch += 8) {
      await Promise.all(
        Array.from({ length: Math.min(8, 46 - batch) }, (_, i) =>
          seedPost(supabase, {
            userId: users.userC.id,
            gameId,
            publishedAt: new Date(Date.UTC(2026, 0, 1, 0, batch + i)).toISOString(),
          }),
        ),
      );
    }

    await page.goto(`/juegos/${gameId}/capturas`);
    await expect(page.getByTestId("post-grid-cell")).toHaveCount(45);
    const nav = page.getByRole("navigation", { name: "Páginas de capturas" });
    await nav.getByRole("link", { name: "Página 2" }).click();
    await expect(page).toHaveURL(/\?page=2$/);
    await expect(page.getByTestId("post-grid-cell")).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId("post-grid-cell")).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Página 2");

    await page.goBack();
    await expect(page.getByTestId("post-grid-cell")).toHaveCount(45);

    // Una página que no existe lleva a la última.
    await page.goto(`/juegos/${gameId}/capturas?page=99`);
    await expect(page).toHaveURL(/\?page=2$/);
  });
});

test.describe("Interacción", () => {
  test("POST-18: like y unlike de una publicación ajena", async ({ page, supabase, users }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Like ${users.runId}`,
      np: 3408,
    });
    const { postId } = await seedPost(supabase, { userId: users.userB.id, gameId });

    await page.goto(`/publicaciones/${postId}`);
    const like = page.getByRole("button", { name: /Me gusta la publicación de/ });
    await expect(like).toHaveAttribute("aria-pressed", "false");
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("post-like-count")).toContainText("1 me gusta");
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

    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => {
        const { count } = await supabase
          .from("post_likes")
          .select("*", { count: "exact", head: true })
          .eq("post_id", postId);
        return count;
      })
      .toBe(0);
  });

  test("POST-19: comentar, notificar al autor y borrar el comentario", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Comentario ${users.runId}`,
      np: 3409,
    });
    const { postId } = await seedPost(supabase, { userId: users.userB.id, gameId });

    await page.goto(`/publicaciones/${postId}`);
    await page.getByLabel("Agregar un comentario").fill("[E2E] ¡qué captura!");
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    const comments = page.getByTestId("post-comments");
    await expect(comments).toContainText("¡qué captura!");

    // El autor del post (userB) lo ve en Actividad › Recibido.
    const asB = await createTestUserClient(users.userB.email, users.userB.password);
    await expect
      .poll(async () => {
        const { data } = await asB.rpc("get_activity_received", { kinds: ["post_comment"] });
        return (data ?? []).filter((row: { post_id: string }) => row.post_id === postId).length;
      })
      .toBe(1);

    await comments.getByRole("button", { name: /Borrar el comentario de/ }).click();
    await expect(comments).toHaveCount(0);
    const { count } = await supabase
      .from("post_comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);
    expect(count).toBe(0);
  });

  test("POST-20: editar descripción y spoiler, y borrar la publicación con sus archivos", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Editar ${users.runId}`,
      np: 3410,
    });
    const { postId } = await seedPost(supabase, {
      userId: users.userA.id,
      gameId,
      files: 2,
      caption: "antes",
    });

    await page.goto(`/publicaciones/${postId}`);
    await page.getByRole("button", { name: "Opciones de la publicación" }).click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    const editor = page.getByRole("dialog", { name: "Editar publicación" });
    await editor.getByLabel("Descripción").fill("[E2E] después");
    await editor.getByRole("switch", { name: "Contiene spoilers" }).click();
    await editor.getByRole("button", { name: "Guardar" }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByText("(editado)")).toBeVisible();
    await expect(page.getByTestId("spoiler-reveal")).toBeVisible();

    const { data: edited } = await supabase
      .from("posts")
      .select("caption, is_spoiler, edited_at")
      .eq("id", postId)
      .single();
    expect(edited).toMatchObject({ caption: "[E2E] después", is_spoiler: true });
    expect(edited?.edited_at).not.toBeNull();

    await page.getByRole("button", { name: "Opciones de la publicación" }).click();
    await page.getByRole("menuitem", { name: "Borrar" }).click();
    await page
      .getByRole("dialog", { name: "¿Borrar la publicación?" })
      .getByRole("button", { name: "Borrar" })
      .click();
    await expect(page).toHaveURL(/\/actividad\/galeria$/);
    await expect(page.locator(`[data-post-id="${postId}"]`)).toHaveCount(0);

    const { data: gone } = await supabase.from("posts").select("id").eq("id", postId);
    expect(gone).toEqual([]);
    await expect.poll(() => listPostObjects(supabase, users.userA.id, postId)).toEqual([]);
  });
});

test.describe("Pantalla completa, like propio y avatares", () => {
  test("POST-24: tocar la foto la abre a pantalla completa con el original; ✕ y Esc la cierran", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Pantalla Completa ${users.runId}`,
      np: 3427,
    });
    const { postId, paths } = await seedPost(supabase, {
      userId: users.userB.id,
      gameId,
      files: 2,
    });

    await page.goto(`/publicaciones/${postId}`);
    const viewer = page.getByTestId("post-media-viewer");

    // Un toque (no doble) abre el visor después de la ventana del doble tap.
    await page.getByTestId("post-carousel").click();
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("img", { name: "Imagen 1 de 2" })).toHaveAttribute(
      "src",
      new RegExp(paths[0].split("/").pop()!.replace(".", "\\.")),
    );
    // En escritorio pide fullscreen al navegador.
    await expect
      .poll(() =>
        page.evaluate(() => document.fullscreenElement?.getAttribute("data-testid") ?? null),
      )
      .toBe("post-media-viewer");
    await viewer.getByRole("button", { name: "Archivo siguiente" }).click();
    await expect(viewer).toContainText("2/2");
    await viewer.getByRole("button", { name: "Cerrar pantalla completa" }).click();
    await expect(viewer).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);

    // El botón de expandir también lo abre, y Esc lo cierra sin salir del detalle.
    await page.getByRole("button", { name: "Ver en pantalla completa" }).click();
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/publicaciones/${postId}$`));
    // Un toque no da like.
    await expect(page.getByRole("button", { name: /Me gusta la publicación de/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("POST-25: doble click da like a la propia publicación, sin abrir la pantalla completa", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Like Propio ${users.runId}`,
      np: 3428,
    });
    const { postId } = await seedPost(supabase, { userId: users.userA.id, gameId });

    await page.goto(`/publicaciones/${postId}`);
    const like = page.getByRole("button", { name: "Me gusta tu publicación" });
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
    await expect(page.getByTestId("post-media-viewer")).toHaveCount(0);

    // El like propio no se avisa en Recibido.
    const asA = await createTestUserClient(users.userA.email, users.userA.password);
    const { data } = await asA.rpc("get_activity_received", { kinds: ["post_like"] });
    expect((data ?? []).filter((row: { post_id: string }) => row.post_id === postId)).toHaveLength(
      0,
    );
  });

  test("POST-26: cada comentario lleva el avatar de su autor, que linkea a su perfil", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts Avatar ${users.runId}`,
      np: 3429,
    });
    const { postId } = await seedPost(supabase, { userId: users.userA.id, gameId });
    const { error } = await supabase
      .from("post_comments")
      .insert({ post_id: postId, user_id: users.userB.id, body: "[E2E] buenísima" });
    expect(error).toBeNull();

    await page.goto(`/publicaciones/${postId}`);
    const row = page.getByTestId("post-comments").getByRole("listitem").first();
    await expect(row).toContainText("buenísima");
    // El avatar es decorativo para el lector (el nombre al lado ya es el link).
    await expect(
      row.locator(`a[href="/perfil/${users.userB.id}"][aria-hidden="true"]`),
    ).toHaveCount(1);
  });
});
