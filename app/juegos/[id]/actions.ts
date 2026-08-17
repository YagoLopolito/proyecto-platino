"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TrophyActionState = { error: string | null; success?: string | null };

const TROPHY_TYPES = ["bronze", "silver", "gold", "platinum"] as const;
type TrophyType = (typeof TROPHY_TYPES)[number];

function isTrophyType(value: string): value is TrophyType {
  return (TROPHY_TYPES as readonly string[]).includes(value);
}

/** Alias cortos aceptados en la carga en lote, además del nombre en inglés. */
const TYPE_ALIASES: Record<string, TrophyType> = {
  bronce: "bronze",
  b: "bronze",
  plata: "silver",
  s: "silver",
  oro: "gold",
  o: "gold",
  platino: "platinum",
  p: "platinum",
};

function parseType(raw: string): TrophyType | null {
  const normalized = raw.trim().toLowerCase();
  if (isTrophyType(normalized)) return normalized;
  return TYPE_ALIASES[normalized] ?? null;
}

/** Confirma que el juego esté en la biblioteca del usuario antes de dejarlo tocar sus trofeos. */
async function assertOwnsGame(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  gameId: string,
) {
  const { data } = await supabase
    .from("user_games")
    .select("game_id")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle();
  return Boolean(data);
}

export async function addTrophy(
  _prevState: TrophyActionState,
  formData: FormData,
): Promise<TrophyActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "").trim();
  const hidden = formData.get("hidden") === "on";

  if (!gameId) {
    return { error: "Falta el juego." };
  }
  if (!name) {
    return { error: "Poné el nombre del trofeo." };
  }
  const type = parseType(typeRaw);
  if (!type) {
    return { error: "Elegí un tipo de trofeo válido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }
  if (!(await assertOwnsGame(supabase, user.id, gameId))) {
    return { error: "Ese juego no está en tu biblioteca." };
  }

  const { error } = await supabase.from("trophies").insert({
    game_id: gameId,
    name,
    description: description || null,
    type,
    hidden,
    created_by: user.id,
  });

  if (error) {
    return { error: `No se pudo crear el trofeo: ${error.message}` };
  }

  revalidatePath(`/juegos/${gameId}`);
  return { error: null, success: `"${name}" agregado.` };
}

export async function addTrophiesBatch(
  _prevState: TrophyActionState,
  formData: FormData,
): Promise<TrophyActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const raw = String(formData.get("list") ?? "");

  if (!gameId) {
    return { error: "Falta el juego." };
  }

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { error: "Pegá al menos un trofeo, uno por línea." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }
  if (!(await assertOwnsGame(supabase, user.id, gameId))) {
    return { error: "Ese juego no está en tu biblioteca." };
  }

  const rows: { game_id: string; name: string; type: TrophyType; created_by: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const [namePart, typePart] = lines[i].split("|");
    const name = namePart?.trim();
    const type = typePart ? parseType(typePart) : null;
    if (!name || !type) {
      return {
        error: `Línea ${i + 1} inválida: "${lines[i]}". Formato esperado: "Nombre | tipo" (bronce/plata/oro/platino).`,
      };
    }
    rows.push({ game_id: gameId, name, type, created_by: user.id });
  }

  const { error } = await supabase.from("trophies").insert(rows);

  if (error) {
    return { error: `No se pudieron crear los trofeos: ${error.message}` };
  }

  revalidatePath(`/juegos/${gameId}`);
  return { error: null, success: `${rows.length} trofeos agregados.` };
}

/** Marca un trofeo como obtenido ahora. La fecha exacta no se le pide al usuario. */
export async function markTrophyObtained(formData: FormData): Promise<void> {
  const trophyId = String(formData.get("trophyId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!trophyId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("user_trophies")
    .upsert(
      { user_id: user.id, trophy_id: trophyId, unlocked_at: new Date().toISOString() },
      { onConflict: "user_id,trophy_id" },
    );

  revalidatePath(`/juegos/${gameId}`);
  revalidatePath("/juegos");
}

export async function unmarkTrophyObtained(formData: FormData): Promise<void> {
  const trophyId = String(formData.get("trophyId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!trophyId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("user_trophies")
    .delete()
    .eq("user_id", user.id)
    .eq("trophy_id", trophyId);

  revalidatePath(`/juegos/${gameId}`);
  revalidatePath("/juegos");
}
