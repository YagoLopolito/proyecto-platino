"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { USER_SEARCH_LIMIT } from "@/lib/friends/constants";
import type { FriendProfile } from "@/lib/friends/queries";

export interface UserSearchResult extends FriendProfile {
  isFriend: boolean;
}

export type SearchUsersOutcome =
  { status: "ok"; results: UserSearchResult[] } | { status: "error"; message: string };

/**
 * Directorio de usuarios para "Agregar amigo". Sin query devuelve los primeros
 * usuarios de la app (el pedido es poder ver a todos, no solo buscar); con
 * query filtra por nombre de PSN o nombre de la app.
 */
export async function searchUsers(query: string): Promise<SearchUsersOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Tenés que iniciar sesión." };
  }

  const term = z
    .string()
    .trim()
    .max(100)
    .parse(query ?? "");

  let profilesQuery = supabase
    .from("public_profiles")
    .select("id, display_name, psn_online_id, avatar_url")
    .neq("id", user.id)
    .limit(USER_SEARCH_LIMIT);

  if (term.length > 0) {
    // `%` y `,` romperían el filtro `or` de PostgREST, que separa condiciones
    // por coma; se escapan antes de armarlo.
    const safe = term.replace(/[%,]/g, " ");
    profilesQuery = profilesQuery.or(`psn_online_id.ilike.%${safe}%,display_name.ilike.%${safe}%`);
  }

  const [{ data: profiles, error }, { data: friendRows }] = await Promise.all([
    profilesQuery,
    supabase.from("friendships").select("friend_id").eq("user_id", user.id),
  ]);

  if (error) {
    return { status: "error", message: error.message };
  }

  const friendIds = new Set((friendRows ?? []).map((row) => row.friend_id));

  return {
    status: "ok",
    results: (profiles ?? [])
      .filter((profile): profile is typeof profile & { id: string } => profile.id !== null)
      .map((profile) => ({
        id: profile.id,
        displayName: profile.display_name,
        psnOnlineId: profile.psn_online_id,
        avatarUrl: profile.avatar_url,
        isFriend: friendIds.has(profile.id),
      })),
  };
}

export interface FriendActionState {
  error: string | null;
  success: string | null;
}

const friendIdSchema = z.string().uuid();

/** Agrega un amigo. La RLS exige `user_id = auth.uid()`, igual que este chequeo. */
export async function addFriend(
  _prevState: FriendActionState,
  formData: FormData,
): Promise<FriendActionState> {
  const parsed = friendIdSchema.safeParse(formData.get("friendId"));
  if (!parsed.success) {
    return { error: "Usuario inválido.", success: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión.", success: null };
  }
  if (parsed.data === user.id) {
    return { error: "No podés agregarte a vos mismo.", success: null };
  }

  // upsert (y no insert) para que volver a agregar a alguien que ya está no
  // falle con un 23505 -- el resultado deseado es el mismo.
  const { error } = await supabase
    .from("friendships")
    .upsert({ user_id: user.id, friend_id: parsed.data }, { onConflict: "user_id,friend_id" });

  if (error) {
    return { error: `No se pudo agregar: ${error.message}`, success: null };
  }

  revalidatePath("/perfil/diario");
  revalidatePath("/biblioteca/resenas");
  return { error: null, success: "Amigo agregado." };
}

/** Saca un amigo de la lista (no toca nada del otro usuario). */
export async function removeFriend(
  _prevState: FriendActionState,
  formData: FormData,
): Promise<FriendActionState> {
  const parsed = friendIdSchema.safeParse(formData.get("friendId"));
  if (!parsed.success) {
    return { error: "Usuario inválido.", success: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión.", success: null };
  }

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_id", user.id)
    .eq("friend_id", parsed.data);

  if (error) {
    return { error: `No se pudo eliminar: ${error.message}`, success: null };
  }

  revalidatePath("/perfil/diario");
  revalidatePath("/biblioteca/resenas");
  return { error: null, success: "Amigo eliminado." };
}
