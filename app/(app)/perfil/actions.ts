"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAX_FAVORITE_GAMES } from "@/lib/profile/constants";

export interface FavoritesActionState {
  error: string | null;
  success: string | null;
}

const gameIdsSchema = z.array(z.string().uuid()).max(MAX_FAVORITE_GAMES);

/**
 * Guarda el Top 5 del perfil: la lista completa, en el orden en que viene.
 *
 * Reescribe (borra + inserta) en vez de hacer updates por casillero: el
 * `unique (user_id, slot)` de la tabla haría fallar cualquier reordenamiento
 * que pase por un estado intermedio con dos juegos en el mismo casillero.
 *
 * Doble capa igual que la autoría de guías: acá se valida que los juegos estén
 * en la biblioteca del usuario (`user_games`) y la RLS exige
 * `user_id = auth.uid()` en la escritura.
 */
export async function saveFavoriteGames(
  _prevState: FavoritesActionState,
  formData: FormData,
): Promise<FavoritesActionState> {
  const parsed = gameIdsSchema.safeParse(formData.getAll("gameIds").map(String));
  if (!parsed.success) {
    return { error: `Elegí hasta ${MAX_FAVORITE_GAMES} juegos.`, success: null };
  }
  const gameIds = Array.from(new Set(parsed.data));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión.", success: null };
  }

  if (gameIds.length > 0) {
    const { data: owned } = await supabase
      .from("user_games")
      .select("game_id")
      .eq("user_id", user.id)
      .in("game_id", gameIds);

    const ownedIds = new Set((owned ?? []).map((row) => row.game_id));
    if (gameIds.some((id) => !ownedIds.has(id))) {
      return { error: "Solo podés destacar juegos de tu biblioteca.", success: null };
    }
  }

  const { error: deleteError } = await supabase
    .from("user_favorite_games")
    .delete()
    .eq("user_id", user.id);
  if (deleteError) {
    return { error: `No se pudo guardar: ${deleteError.message}`, success: null };
  }

  if (gameIds.length > 0) {
    const { error: insertError } = await supabase.from("user_favorite_games").insert(
      gameIds.map((gameId, index) => ({
        user_id: user.id,
        game_id: gameId,
        slot: index + 1,
      })),
    );
    if (insertError) {
      return { error: `No se pudo guardar: ${insertError.message}`, success: null };
    }
  }

  revalidatePath("/perfil");
  revalidatePath(`/perfil/${user.id}`);
  return {
    error: null,
    success: gameIds.length > 0 ? "Top 5 actualizado." : "Top 5 vacío.",
  };
}
