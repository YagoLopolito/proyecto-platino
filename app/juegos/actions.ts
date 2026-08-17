"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GameActionState = { error: string | null; success?: string | null };

/** Plataformas aceptadas en el alta manual. */
const PLATFORMS = ["PS3", "PS4", "PS5", "PS Vita"] as const;

function isPlatform(value: string): value is (typeof PLATFORMS)[number] {
  return (PLATFORMS as readonly string[]).includes(value);
}

/**
 * Agrega un juego a la biblioteca del usuario.
 *
 * `games` es un catálogo compartido: si el juego ya existe (mismo nombre y
 * plataforma) se reutiliza esa fila en vez de duplicarla, y sólo se crea el
 * vínculo en `user_games`.
 */
export async function addGame(
  _prevState: GameActionState,
  formData: FormData,
): Promise<GameActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const platform = String(formData.get("platform") ?? "").trim();

  if (!name) {
    return { error: "Poné el nombre del juego." };
  }
  if (!isPlatform(platform)) {
    return { error: "Elegí una plataforma válida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  // Reutilizar la fila del catálogo si ya existe ese juego en esa plataforma.
  const { data: existing, error: lookupError } = await supabase
    .from("games")
    .select("id")
    .ilike("name", name)
    .eq("platform", platform)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return { error: `No se pudo buscar el juego: ${lookupError.message}` };
  }

  let gameId = existing?.id;

  if (!gameId) {
    const { data: created, error: insertError } = await supabase
      .from("games")
      .insert({ name, platform, created_by: user.id, source: "manual" })
      .select("id")
      .single();

    if (insertError) {
      return { error: `No se pudo crear el juego: ${insertError.message}` };
    }
    gameId = created.id;
  }

  const { error: linkError } = await supabase
    .from("user_games")
    .insert({ user_id: user.id, game_id: gameId });

  if (linkError) {
    // 23505 = unique_violation: el juego ya estaba en la biblioteca.
    if (linkError.code === "23505") {
      return { error: `"${name}" ya está en tu biblioteca.` };
    }
    return { error: `No se pudo agregar a la biblioteca: ${linkError.message}` };
  }

  revalidatePath("/juegos");
  return { error: null, success: `"${name}" agregado a tu biblioteca.` };
}

/**
 * Saca un juego de la biblioteca del usuario.
 * No borra la fila de `games`: el catálogo es compartido y otros usuarios
 * pueden tener el mismo juego.
 */
export async function removeGame(formData: FormData): Promise<void> {
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("user_games").delete().eq("user_id", user.id).eq("game_id", gameId);

  revalidatePath("/juegos");
}
