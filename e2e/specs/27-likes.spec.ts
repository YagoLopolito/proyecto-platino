import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { createTestUserClient } from "../helpers/supabase";

/**
 * Likes en reseñas y listas (epic #183, issue #190). Casos LIKE-01..06 de
 * TESTING_PRD.md §6.24.
 *
 * En serie: todos escriben likes sobre la misma reseña de userB. Cada test
 * rehace la reseña (borrarla se lleva sus likes en cascada), así un reintento
 * arranca de cero.
 */
test.describe.configure({ mode: "serial" });

const REVIEW = "[E2E] Reseña de userB para likear";
const OWN_REVIEW = "[E2E] Reseña propia de userA";

/** Juego de userA con una reseña de userB, sin likes. Devuelve el id de la entrada. */
async function seedReviewOfB(
  supabase: SupabaseClient,
  users: { userA: { id: string }; userB: { id: string } },
): Promise<{ gameId: string; entryId: string }> {
  const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
    n: 1,
    nameSuffix: "Likes",
    np: 2701,
  });
  await supabase
    .from("game_diary_entries")
    .delete()
    .eq("game_id", gameId)
    .in("user_id", [users.userA.id, users.userB.id]);
  const { data: entry, error } = await supabase
    .from("game_diary_entries")
    .insert({
      user_id: users.userB.id,
      game_id: gameId,
      playthrough_number: 1,
      finished_on: "2026-06-01",
      rating: 8,
      review: REVIEW,
    })
    .select("id")
    .single();
  if (error || !entry) throw new Error(`No se pudo seedear la reseña: ${error?.message}`);
  return { gameId, entryId: entry.id };
}

async function likeRows(supabase: SupabaseClient, entryId: string) {
  const { data } = await supabase.from("review_likes").select("user_id").eq("entry_id", entryId);
  return data ?? [];
}

async function seedListOfB(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  visibility: "public" | "private",
): Promise<string> {
  await supabase.from("user_lists").delete().eq("user_id", userId).eq("title", title);
  const { data: list, error } = await supabase
    .from("user_lists")
    .insert({ user_id: userId, title, visibility })
    .select("id")
    .single();
  if (error || !list) throw new Error(`No se pudo seedear la lista: ${error?.message}`);
  return list.id;
}

test.describe("Likes", () => {
  test("LIKE-01 y LIKE-02: likear una reseña ajena suma 1, persiste y se puede quitar", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId, entryId } = await seedReviewOfB(supabase, users);

    await page.goto(`/juegos/${gameId}/resenas`);
    const row = page.getByRole("listitem").filter({ hasText: REVIEW });
    const heart = row.getByRole("button", { name: /^Me gusta la reseña de / });
    await expect(heart).toHaveAttribute("aria-pressed", "false");

    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(row.getByText("1 me gusta")).toBeVisible();
    await expect.poll(async () => (await likeRows(supabase, entryId)).length).toBe(1);

    await page.reload();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(row.getByText("1 me gusta")).toBeVisible();

    // LIKE-02: quitarlo.
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => (await likeRows(supabase, entryId)).length).toBe(0);
    await page.reload();
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await expect(row.getByText("me gusta")).toHaveCount(0);
  });

  test("LIKE-03: no se puede likear lo propio", async ({ page, supabase, users }) => {
    const { gameId } = await seedReviewOfB(supabase, users);
    const { data: own } = await supabase
      .from("game_diary_entries")
      .insert({
        user_id: users.userA.id,
        game_id: gameId,
        playthrough_number: 1,
        finished_on: "2026-06-02",
        review: OWN_REVIEW,
      })
      .select("id")
      .single();
    const listId = await seedListOfB(supabase, users.userA.id, "[E2E] Lista propia", "public");

    // En la UI, sobre lo tuyo no hay corazón que tocar.
    await page.goto(`/juegos/${gameId}/resenas`);
    await expect(page.getByText(OWN_REVIEW)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Me gusta la reseña de / })).toHaveCount(1);
    await page.goto(`/listas/${listId}`);
    await expect(page.getByRole("heading", { level: 1, name: "[E2E] Lista propia" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Me gusta la lista / })).toHaveCount(0);

    // Y la RLS lo rechaza aunque se saltee la UI.
    const asA = await createTestUserClient(users.userA.email, users.userA.password);
    const { error: reviewError } = await asA
      .from("review_likes")
      .insert({ user_id: users.userA.id, entry_id: own!.id });
    expect(reviewError).not.toBeNull();
    const { error: listError } = await asA
      .from("list_likes")
      .insert({ user_id: users.userA.id, list_id: listId });
    expect(listError).not.toBeNull();
  });

  test("LIKE-04: no se puede likear una lista privada ajena", async ({ supabase, users }) => {
    const listId = await seedListOfB(
      supabase,
      users.userB.id,
      "[E2E] Lista privada de B",
      "private",
    );

    const asA = await createTestUserClient(users.userA.email, users.userA.password);
    const { error } = await asA
      .from("list_likes")
      .insert({ user_id: users.userA.id, list_id: listId });
    expect(error).not.toBeNull();

    const { data } = await supabase.from("list_likes").select("user_id").eq("list_id", listId);
    expect(data).toEqual([]);
  });

  test("LIKE-05: borrar la reseña borra sus likes", async ({ supabase, users }) => {
    const { entryId } = await seedReviewOfB(supabase, users);
    const asA = await createTestUserClient(users.userA.email, users.userA.password);
    const { error } = await asA
      .from("review_likes")
      .insert({ user_id: users.userA.id, entry_id: entryId });
    expect(error).toBeNull();
    expect(await likeRows(supabase, entryId)).toHaveLength(1);

    await supabase.from("game_diary_entries").delete().eq("id", entryId);
    expect(await likeRows(supabase, entryId)).toHaveLength(0);
  });

  test("LIKE-06: likear una lista pública ajena desde su ficha", async ({
    page,
    supabase,
    users,
  }) => {
    const title = "[E2E] Lista pública de B";
    const listId = await seedListOfB(supabase, users.userB.id, title, "public");

    await page.goto(`/listas/${listId}`);
    const heart = page.getByRole("button", { name: `Me gusta la lista ${title}` });
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => {
        const { data } = await supabase.from("list_likes").select("user_id").eq("list_id", listId);
        return (data ?? []).map((row) => row.user_id);
      })
      .toEqual([users.userA.id]);

    await page.reload();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("1 me gusta")).toBeVisible();
  });
});
