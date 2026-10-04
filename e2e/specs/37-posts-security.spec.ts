import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { createTestUserClient } from "../helpers/supabase";
import { makePng, seedPost } from "../helpers/posts";

/**
 * Galería online: RLS de verdad, con clientes logueados (no service role, que
 * se saltea las policies). Casos POST-30..POST-35 de TESTING_PRD.md §6.28.
 * userA es el autor; userB, otro usuario cualquiera.
 */
test.describe("RLS de publicaciones", () => {
  test("POST-30: nadie edita ni borra una publicación ajena", async ({ supabase, users }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts RLS Editar ${users.runId}`,
      np: 3421,
    });
    const { postId } = await seedPost(supabase, { userId: users.userA.id, gameId });
    const asB = await createTestUserClient(users.userB.email, users.userB.password);

    const { data: updated } = await asB
      .from("posts")
      .update({ caption: "hackeado" })
      .eq("id", postId)
      .select("id");
    expect(updated ?? []).toEqual([]);
    const { data: deleted } = await asB.from("posts").delete().eq("id", postId).select("id");
    expect(deleted ?? []).toEqual([]);

    const { data: post } = await supabase.from("posts").select("caption").eq("id", postId).single();
    expect(post?.caption).not.toBe("hackeado");
  });

  test("POST-31: un comentario lo borra su autor o el autor del post, nadie más", async ({
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts RLS Comentarios ${users.runId}`,
      np: 3422,
    });
    const { postId } = await seedPost(supabase, { userId: users.userA.id, gameId });
    const asA = await createTestUserClient(users.userA.email, users.userA.password);
    const asB = await createTestUserClient(users.userB.email, users.userB.password);
    const asC = await createTestUserClient(users.userC.email, users.userC.password);

    const { data: comment, error } = await asB
      .from("post_comments")
      .insert({ post_id: postId, user_id: users.userB.id, body: "[E2E] comentario de B" })
      .select("id")
      .single();
    expect(error).toBeNull();

    // C no puede borrar el comentario de B en el post de A.
    const { data: byC } = await asC
      .from("post_comments")
      .delete()
      .eq("id", comment!.id)
      .select("id");
    expect(byC ?? []).toEqual([]);
    // A, autor del post, sí.
    const { data: byA } = await asA
      .from("post_comments")
      .delete()
      .eq("id", comment!.id)
      .select("id");
    expect(byA).toHaveLength(1);
  });

  test("POST-32: un post en subida sólo lo ve su autor, y no se publica vacío", async ({
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts RLS Subida ${users.runId}`,
      np: 3423,
    });
    const asA = await createTestUserClient(users.userA.email, users.userA.password);
    const asB = await createTestUserClient(users.userB.email, users.userB.password);

    const { data: draft } = await asA
      .from("posts")
      .insert({ user_id: users.userA.id, game_id: gameId, caption: "[E2E] borrador" })
      .select("id")
      .single();
    expect(draft).not.toBeNull();

    const { data: seenByB } = await asB.from("posts").select("id").eq("id", draft!.id);
    expect(seenByB).toEqual([]);

    // Publicar sin archivos lo corta el trigger.
    const { error } = await asA.from("posts").update({ status: "published" }).eq("id", draft!.id);
    expect(error?.message).toMatch(/al menos un archivo/);
  });

  test("POST-33: no se puede dar like dos veces; la propia sí se likea, como en Instagram", async ({
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts RLS Like ${users.runId}`,
      np: 3424,
    });
    const { postId } = await seedPost(supabase, { userId: users.userA.id, gameId });
    const asA = await createTestUserClient(users.userA.email, users.userA.password);
    const asB = await createTestUserClient(users.userB.email, users.userB.password);

    const first = await asB.from("post_likes").insert({ post_id: postId, user_id: users.userB.id });
    expect(first.error).toBeNull();
    const second = await asB
      .from("post_likes")
      .insert({ post_id: postId, user_id: users.userB.id });
    expect(second.error?.code).toBe("23505");

    const own = await asA.from("post_likes").insert({ post_id: postId, user_id: users.userA.id });
    expect(own.error).toBeNull();
    // A nombre de otro, nunca.
    const forged = await asA
      .from("post_likes")
      .insert({ post_id: postId, user_id: users.userC.id });
    expect(forged.error).not.toBeNull();
  });

  test("POST-34: los archivos sólo se suben a tu carpeta y a un post tuyo en subida", async ({
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts RLS Storage ${users.runId}`,
      np: 3425,
    });
    const { postId: published } = await seedPost(supabase, { userId: users.userA.id, gameId });
    const asA = await createTestUserClient(users.userA.email, users.userA.password);
    const asB = await createTestUserClient(users.userB.email, users.userB.password);
    const file = makePng(32, 18);

    // B en la carpeta de A.
    const intoOther = await asB.storage
      .from("post-media")
      .upload(`${users.userA.id}/${published}/9-x.png`, file, { contentType: "image/png" });
    expect(intoOther.error).not.toBeNull();

    // A en un post suyo ya publicado.
    const intoPublished = await asA.storage
      .from("post-media")
      .upload(`${users.userA.id}/${published}/9-x.png`, file, { contentType: "image/png" });
    expect(intoPublished.error).not.toBeNull();
  });

  test("POST-35: con sesión se firman los archivos de un post visible", async ({
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: `Posts RLS Firma ${users.runId}`,
      np: 3426,
    });
    const { paths } = await seedPost(supabase, { userId: users.userA.id, gameId });
    const asB = await createTestUserClient(users.userB.email, users.userB.password);
    const { data, error } = await asB.storage.from("post-media").createSignedUrl(paths[0], 60);
    expect(error).toBeNull();
    const response = await fetch(data!.signedUrl);
    expect(response.status).toBe(200);
  });
});
