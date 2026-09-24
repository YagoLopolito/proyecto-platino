import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "../fixtures/test";
import { seedGameWithTrophies } from "../helpers/seed";
import { testGameTitle } from "../helpers/ids";
import { createTestUserClient } from "../helpers/supabase";
import { formatDiaryDate, relativeTime } from "@/lib/activity/format";

/**
 * Actividad (epic #183, issue #195). Casos ACT-01..06 de TESTING_PRD.md §6.27.
 *
 * En serie: todos escriben sobre el diario y las amistades de userA/userB.
 * Cada test rehace lo que necesita (borra antes de insertar), así un reintento
 * arranca de cero.
 */
test.describe.configure({ mode: "serial" });

const GAME = "Actividad";
const REVIEW = "[E2E] Reseña para la actividad";

async function follow(supabase: SupabaseClient, userId: string, friendId: string) {
  await supabase
    .from("friendships")
    .upsert({ user_id: userId, friend_id: friendId }, { onConflict: "user_id,friend_id" });
}

async function seedEntry(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
): Promise<string> {
  await supabase.from("game_diary_entries").delete().eq("game_id", gameId).eq("user_id", userId);
  const { data, error } = await supabase
    .from("game_diary_entries")
    .insert({
      user_id: userId,
      game_id: gameId,
      playthrough_number: 1,
      finished_on: "2026-09-23",
      rating: 8,
      review: REVIEW,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo seedear la entrada: ${error?.message}`);
  return data.id;
}

test.describe("Actividad", () => {
  test("ACT-01 y ACT-04: la entrada de un amigo aparece en Amigos y borrarla la saca", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: GAME,
      np: 3101,
    });
    await follow(supabase, users.userA.id, users.userB.id);
    const entryId = await seedEntry(supabase, users.userB.id, gameId);

    await page.goto("/actividad");
    const row = page.getByRole("listitem").filter({ hasText: testGameTitle(GAME) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("registró");
    await expect(row).toContainText("el miércoles 23 de septiembre");
    await expect(row.getByRole("link", { name: testGameTitle(GAME) })).toHaveAttribute(
      "href",
      new RegExp(`/juegos/${gameId}`),
    );

    // ACT-04: sin tabla de eventos, borrar la fuente saca la fila.
    await supabase.from("game_diary_entries").delete().eq("id", entryId);
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: testGameTitle(GAME) })).toHaveCount(
      0,
    );
  });

  test("ACT-02: un platino aparece en Vos y nunca en Amigos de quien te sigue", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId, trophyIds } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 4,
      nameSuffix: "Actividad Platino",
      np: 3102,
    });
    const platinumId = trophyIds[3];
    await supabase.from("user_trophies").upsert(
      { user_id: users.userA.id, trophy_id: platinumId, unlocked_at: new Date().toISOString() },
      { onConflict: "user_id,trophy_id" },
    );
    await follow(supabase, users.userB.id, users.userA.id);

    await page.goto("/actividad/vos?tipo=platinos");
    const row = page.getByRole("listitem").filter({ hasText: testGameTitle("Actividad Platino") });
    await expect(row).toContainText("Platinaste");
    await expect(row.getByRole("link", { name: testGameTitle("Actividad Platino") })).toBeVisible();

    const asB = await createTestUserClient(users.userB.email, users.userB.password);
    const { data, error } = await asB.rpc("get_activity_friends", { max_rows: 100 });
    expect(error).toBeNull();
    const rows = (data ?? []) as { kind: string; game_id: string | null }[];
    expect(rows.filter((r) => r.kind === "platinum")).toEqual([]);
    expect(rows.filter((r) => r.game_id === gameId)).toEqual([]);
  });

  test("ACT-03: un like a tu reseña aparece en Recibido", async ({ page, supabase, users }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Actividad Like",
      np: 3103,
    });
    const entryId = await seedEntry(supabase, users.userA.id, gameId);
    await supabase.from("review_likes").insert({ user_id: users.userB.id, entry_id: entryId });

    await page.goto("/actividad/recibido");
    const row = page.getByRole("listitem").filter({ hasText: testGameTitle("Actividad Like") });
    await expect(row).toContainText("le gustó tu reseña de");
  });

  test("ACT-05: 'Cargar más' suma la página siguiente sin repetir", async ({
    page,
    supabase,
    users,
  }) => {
    const { gameId } = await seedGameWithTrophies(supabase, users.userA.id, {
      n: 1,
      nameSuffix: "Actividad Paginas",
      np: 3104,
    });
    await supabase.from("now_playing").delete().eq("user_id", users.userA.id);
    // 32 rachas cerradas del mismo juego (el unique sólo cubre la abierta).
    const base = Date.now() - 60 * 60 * 1000;
    const rows = Array.from({ length: 32 }, (_, i) => ({
      user_id: users.userA.id,
      game_id: gameId,
      started_at: new Date(base - i * 60_000).toISOString(),
      ended_at: new Date(base - i * 60_000 + 30_000).toISOString(),
      end_reason: "manual",
    }));
    const { error } = await supabase.from("now_playing").insert(rows);
    expect(error).toBeNull();

    await page.goto("/actividad/vos?tipo=jugando");
    const list = page.getByRole("list", { name: "Tu actividad" });
    await expect(list.getByRole("listitem")).toHaveCount(30);
    await page.getByRole("button", { name: "Cargar más" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(32);
    await expect(page.getByRole("button", { name: "Cargar más" })).toHaveCount(0);

    await supabase.from("now_playing").delete().eq("user_id", users.userA.id);
  });

  test("ACT-06: tiempo relativo y fecha en español sin desfase de día", async () => {
    const now = Date.parse("2026-09-24T12:00:00Z");
    expect(relativeTime("2026-09-24T11:22:00Z", now)).toBe("38 min");
    expect(relativeTime("2026-09-24T10:00:00Z", now)).toBe("2 h");
    expect(relativeTime("2026-09-23T11:00:00Z", now)).toBe("1 d");
    expect(relativeTime("2026-09-17T11:00:00Z", now)).toBe("1 sem");

    // Medianoche UTC del 23 es el 22 a la noche en Argentina: no puede correrse.
    expect(formatDiaryDate("2026-09-23", 2026)).toBe("el miércoles 23 de septiembre");
    expect(formatDiaryDate("2025-01-01", 2026)).toBe("el miércoles 1 de enero de 2025");
    expect(formatDiaryDate("no-es-fecha")).toBeNull();
  });
});
