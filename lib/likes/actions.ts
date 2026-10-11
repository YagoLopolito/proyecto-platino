"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";

/**
 * Likes en reseñas y listas (epic #183, issue #190). La action recibe el
 * estado deseado (`liked`) y no un "toggle": el corazón es optimista, y dos
 * toques rápidos tienen que terminar en lo que se ve, no en un estado cruzado.
 *
 * Doble capa: acá se rechaza likear lo propio con un mensaje, y la RLS de
 * `review_likes` / `list_likes` lo rechaza igual si algo llega sin pasar por
 * acá.
 */

export type LikeActionResult = { error: string | null };

const idSchema = z.string().uuid();

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function setReviewLike(entryId: string, liked: boolean): Promise<LikeActionResult> {
  const parsed = idSchema.safeParse(entryId);
  if (!parsed.success) return { error: "Falta la reseña." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { data: entry } = await supabase
    .from("game_diary_entries")
    .select("id, user_id, game_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!entry) return { error: "No encontramos esa reseña." };
  if (entry.user_id === user.id) return { error: "No podés darle me gusta a tu propia reseña." };

  const { error } = liked
    ? await supabase
        .from("review_likes")
        .upsert(
          { user_id: user.id, entry_id: entry.id },
          { onConflict: "user_id,entry_id", ignoreDuplicates: true },
        )
    : await supabase.from("review_likes").delete().eq("user_id", user.id).eq("entry_id", entry.id);
  if (error) return { error: dbErrorMessage("likes", error, "No se pudo guardar el me gusta.") };

  revalidatePath(`/juegos/${entry.game_id}`, "layout");
  revalidatePath("/biblioteca/resenas");
  revalidatePath("/perfil", "layout");
  return { error: null };
}

export async function setListLike(listId: string, liked: boolean): Promise<LikeActionResult> {
  const parsed = idSchema.safeParse(listId);
  if (!parsed.success) return { error: "Falta la lista." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  // La RLS de `user_lists` ya esconde una lista privada ajena: para acá no
  // existe, igual que para su ficha (404).
  const { data: list } = await supabase
    .from("user_lists")
    .select("id, user_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!list) return { error: "No encontramos esa lista." };
  if (list.user_id === user.id) return { error: "No podés darle me gusta a tu propia lista." };

  const { error } = liked
    ? await supabase
        .from("list_likes")
        .upsert(
          { user_id: user.id, list_id: list.id },
          { onConflict: "user_id,list_id", ignoreDuplicates: true },
        )
    : await supabase.from("list_likes").delete().eq("user_id", user.id).eq("list_id", list.id);
  if (error) return { error: dbErrorMessage("likes", error, "No se pudo guardar el me gusta.") };

  revalidatePath(`/listas/${list.id}`, "layout");
  revalidatePath("/perfil", "layout");
  revalidatePath("/biblioteca/listas");
  return { error: null };
}
