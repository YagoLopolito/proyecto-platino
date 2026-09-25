"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_LIST_DESCRIPTION,
  MAX_LIST_ITEMS,
  MAX_LIST_NOTE,
  MAX_LIST_TITLE,
} from "@/lib/lists/constants";
import { getUserLists } from "@/lib/lists/queries";

/**
 * Server Actions de las listas (epic #183, issue #189). Doble capa, como todo
 * el contenido de usuario: acá se escribe sólo con el usuario de la sesión y
 * se filtra por `user_id`, y la RLS de `user_lists` / `user_list_items` exige
 * que la lista sea de `auth.uid()`.
 */

const listInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z
      .string()
      .trim()
      .min(1, "Ponele un título a la lista.")
      .max(MAX_LIST_TITLE, `El título puede tener hasta ${MAX_LIST_TITLE} caracteres.`),
    description: z
      .string()
      .trim()
      .max(
        MAX_LIST_DESCRIPTION,
        `La descripción puede tener hasta ${MAX_LIST_DESCRIPTION} caracteres.`,
      ),
    isRanked: z.boolean(),
    visibility: z.enum(["public", "private"]),
    items: z
      .array(
        z.object({
          gameId: z.string().uuid(),
          note: z
            .string()
            .trim()
            .max(MAX_LIST_NOTE, `Cada nota puede tener hasta ${MAX_LIST_NOTE} caracteres.`),
        }),
      )
      .max(MAX_LIST_ITEMS, `Una lista puede tener hasta ${MAX_LIST_ITEMS} juegos.`),
  })
  .refine((input) => new Set(input.items.map((item) => item.gameId)).size === input.items.length, {
    message: "Hay un juego repetido en la lista.",
  });

export type ListInput = z.input<typeof listInputSchema>;
export type SaveListResult = { error: string | null; listId?: string };

function revalidateLists(listId?: string) {
  revalidatePath("/perfil", "layout");
  revalidatePath("/biblioteca/listas");
  if (listId) revalidatePath(`/listas/${listId}`, "layout");
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Crea o edita una lista. Los items se **reescriben enteros** (delete +
 * insert), igual que el Top 5: reordenar de a uno pasaría por un estado con
 * dos juegos en la misma `position` y el unique lo rechazaría.
 */
export async function saveList(input: ListInput): Promise<SaveListResult> {
  const parsed = listInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { id, title, description, isRanked, visibility, items } = parsed.data;

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const fields = {
    title,
    description: description || null,
    is_ranked: isRanked,
    visibility,
    updated_at: new Date().toISOString(),
  };

  let listId: string;
  if (id) {
    // `.eq("user_id")`: sin esto, la RLS igual lo frenaría, pero el error
    // sería un "0 filas" silencioso en vez de un mensaje.
    const { data: updated, error } = await supabase
      .from("user_lists")
      .update(fields)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) return { error: `No se pudo guardar la lista: ${error.message}` };
    if (!updated) return { error: "No encontramos esa lista entre las tuyas." };
    listId = updated.id;

    const { error: deleteError } = await supabase
      .from("user_list_items")
      .delete()
      .eq("list_id", listId);
    if (deleteError)
      return { error: `No se pudieron actualizar los juegos: ${deleteError.message}` };
  } else {
    const { data: created, error } = await supabase
      .from("user_lists")
      .insert({ ...fields, user_id: user.id })
      .select("id")
      .single();
    if (error || !created) return { error: `No se pudo crear la lista: ${error?.message}` };
    listId = created.id;
  }

  if (items.length > 0) {
    const { error } = await supabase.from("user_list_items").insert(
      items.map((item, index) => ({
        list_id: listId,
        game_id: item.gameId,
        position: index + 1,
        note: item.note || null,
      })),
    );
    if (error) return { error: `No se pudieron guardar los juegos: ${error.message}`, listId };
  }

  revalidateLists(listId);
  return { error: null, listId };
}

export async function deleteList(listId: string): Promise<{ error: string | null }> {
  const parsed = z.string().uuid().safeParse(listId);
  if (!parsed.success) return { error: "Falta la lista." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { error } = await supabase
    .from("user_lists")
    .delete()
    .eq("id", parsed.data)
    .eq("user_id", user.id);
  if (error) return { error: `No se pudo borrar la lista: ${error.message}` };

  revalidateLists();
  return { error: null };
}

export interface ListForGame {
  id: string;
  title: string;
  itemCount: number;
  containsGame: boolean;
}

export type ListsForGameResult =
  { status: "ok"; lists: ListForGame[] } | { status: "error"; message: string };

/**
 * Tus listas, marcando en cuáles ya está el juego: lo que muestra "Agregar a
 * una lista" en la ficha. Se pide al abrir el diálogo, no al renderizar la
 * ficha: la mayoría de las visitas no lo abren.
 */
export async function getMyListsForGame(gameId: string): Promise<ListsForGameResult> {
  const parsed = z.string().uuid().safeParse(gameId);
  if (!parsed.success) return { status: "error", message: "Falta el juego." };

  const { supabase, user } = await requireUser();
  if (!user) return { status: "error", message: "Tenés que iniciar sesión." };

  const lists = await getUserLists(supabase, user.id);
  return {
    status: "ok",
    lists: lists.map((list) => ({
      id: list.id,
      title: list.title,
      itemCount: list.itemCount,
      containsGame: list.gameIds.includes(parsed.data),
    })),
  };
}

/**
 * Agrega el juego al final de la lista, o lo saca si ya estaba. Al sacarlo
 * quedan huecos en `position` (1, 2, 4...): el orden se mantiene y la próxima
 * edición completa la renumera.
 */
export async function toggleGameInList(
  listId: string,
  gameId: string,
): Promise<{ error: string | null; containsGame?: boolean }> {
  const ids = z.object({ listId: z.string().uuid(), gameId: z.string().uuid() }).safeParse({
    listId,
    gameId,
  });
  if (!ids.success) return { error: "Faltan datos." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Tenés que iniciar sesión." };

  const { data: list } = await supabase
    .from("user_lists")
    .select("id, user_list_items (game_id, position)")
    .eq("id", ids.data.listId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!list) return { error: "No encontramos esa lista entre las tuyas." };

  const items = list.user_list_items ?? [];
  const alreadyIn = items.some((item) => item.game_id === ids.data.gameId);

  if (alreadyIn) {
    const { error } = await supabase
      .from("user_list_items")
      .delete()
      .eq("list_id", list.id)
      .eq("game_id", ids.data.gameId);
    if (error) return { error: `No se pudo sacar de la lista: ${error.message}` };
  } else {
    if (items.length >= MAX_LIST_ITEMS) {
      return { error: `Una lista puede tener hasta ${MAX_LIST_ITEMS} juegos.` };
    }
    const nextPosition = items.reduce((max, item) => Math.max(max, item.position), 0) + 1;
    const { error } = await supabase
      .from("user_list_items")
      .insert({ list_id: list.id, game_id: ids.data.gameId, position: nextPosition });
    if (error) return { error: `No se pudo agregar a la lista: ${error.message}` };
  }

  await supabase
    .from("user_lists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", list.id)
    .eq("user_id", user.id);

  // La ficha no se revalida: revalidar la página que se está viendo hace que
  // la action espere su re-render entero (segundos por toque). El panel
  // actualiza su estado solo (`AddToListPanel` → `onChange`).
  revalidateLists(list.id);
  return { error: null, containsGame: !alreadyIn };
}
