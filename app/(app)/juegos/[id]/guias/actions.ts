"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GuideActionState = { error: string | null; success?: string | null };

/** Confirma que el usuario sea el autor de la guía antes de dejarlo tocarla. */
async function assertOwnsGuide(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  guideId: string,
) {
  const { data } = await supabase
    .from("guides")
    .select("author_id")
    .eq("id", guideId)
    .maybeSingle();
  return data?.author_id === userId;
}

export async function createGuide(
  _prevState: GuideActionState,
  formData: FormData,
): Promise<GuideActionState> {
  const gameId = String(formData.get("gameId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const contentMarkdown = String(formData.get("contentMarkdown") ?? "").trim();
  const externalUrl = String(formData.get("externalUrl") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  if (!gameId) {
    return { error: "Falta el juego." };
  }
  if (!title) {
    return { error: "Poné un título para la guía." };
  }
  if (!contentMarkdown && !externalUrl) {
    return { error: "Escribí contenido en markdown o pegá un link externo." };
  }
  if (externalUrl && !/^https?:\/\//i.test(externalUrl)) {
    return { error: "El link externo tiene que empezar con http:// o https://." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const { error } = await supabase.from("guides").insert({
    game_id: gameId,
    author_id: user.id,
    title,
    content_markdown: contentMarkdown || null,
    external_url: externalUrl || null,
    source: source || null,
  });

  if (error) {
    return { error: `No se pudo crear la guía: ${error.message}` };
  }

  revalidatePath(`/juegos/${gameId}/guias`);
  return { error: null, success: `Guía "${title}" creada.` };
}

export async function updateGuide(
  _prevState: GuideActionState,
  formData: FormData,
): Promise<GuideActionState> {
  const guideId = String(formData.get("guideId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const contentMarkdown = String(formData.get("contentMarkdown") ?? "").trim();
  const externalUrl = String(formData.get("externalUrl") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  if (!guideId || !gameId) {
    return { error: "Falta la guía." };
  }
  if (!title) {
    return { error: "Poné un título para la guía." };
  }
  if (!contentMarkdown && !externalUrl) {
    return { error: "Escribí contenido en markdown o pegá un link externo." };
  }
  if (externalUrl && !/^https?:\/\//i.test(externalUrl)) {
    return { error: "El link externo tiene que empezar con http:// o https://." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }

  const { error } = await supabase
    .from("guides")
    .update({
      title,
      content_markdown: contentMarkdown || null,
      external_url: externalUrl || null,
      source: source || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guideId)
    .eq("author_id", user.id);

  if (error) {
    return { error: `No se pudo actualizar la guía: ${error.message}` };
  }

  revalidatePath(`/juegos/${gameId}/guias`);
  return { error: null, success: "Guía actualizada." };
}

export async function deleteGuide(formData: FormData): Promise<void> {
  const guideId = String(formData.get("guideId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!guideId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("guides").delete().eq("id", guideId).eq("author_id", user.id);

  revalidatePath(`/juegos/${gameId}/guias`);
}

export async function addStep(
  _prevState: GuideActionState,
  formData: FormData,
): Promise<GuideActionState> {
  const guideId = String(formData.get("guideId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  const trophyId = String(formData.get("trophyId") ?? "").trim();
  const stepOrder = Number(formData.get("stepOrder") ?? 0);

  if (!guideId || !gameId) {
    return { error: "Falta la guía." };
  }
  if (!content) {
    return { error: "Escribí el contenido del paso." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }
  if (!(await assertOwnsGuide(supabase, user.id, guideId))) {
    return { error: "Solo el autor puede editar esta guía." };
  }

  const { error } = await supabase.from("guide_steps").insert({
    guide_id: guideId,
    content,
    trophy_id: trophyId || null,
    step_order: stepOrder,
  });

  if (error) {
    return { error: `No se pudo agregar el paso: ${error.message}` };
  }

  revalidatePath(`/juegos/${gameId}/guias`);
  return { error: null, success: "Paso agregado." };
}

export async function updateStep(
  _prevState: GuideActionState,
  formData: FormData,
): Promise<GuideActionState> {
  const stepId = String(formData.get("stepId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  const trophyId = String(formData.get("trophyId") ?? "").trim();

  if (!stepId || !guideId) {
    return { error: "Falta el paso." };
  }
  if (!content) {
    return { error: "Escribí el contenido del paso." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tenés que iniciar sesión." };
  }
  if (!(await assertOwnsGuide(supabase, user.id, guideId))) {
    return { error: "Solo el autor puede editar esta guía." };
  }

  const { error } = await supabase
    .from("guide_steps")
    .update({ content, trophy_id: trophyId || null })
    .eq("id", stepId);

  if (error) {
    return { error: `No se pudo actualizar el paso: ${error.message}` };
  }

  revalidatePath(`/juegos/${gameId}/guias`);
  return { error: null, success: "Paso actualizado." };
}

export async function deleteStep(formData: FormData): Promise<void> {
  const stepId = String(formData.get("stepId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!stepId || !guideId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (!(await assertOwnsGuide(supabase, user.id, guideId))) return;

  await supabase.from("guide_steps").delete().eq("id", stepId);

  revalidatePath(`/juegos/${gameId}/guias`);
}

/**
 * Tilda/destilda un paso en el checklist personal del usuario. Independiente
 * de si el trofeo asociado ya sincronizó como obtenido.
 */
export async function toggleStepProgress(formData: FormData): Promise<void> {
  const stepId = String(formData.get("stepId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const completed = formData.get("completed") === "true";
  if (!stepId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (completed) {
    await supabase
      .from("user_guide_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("guide_step_id", stepId);
  } else {
    await supabase.from("user_guide_progress").upsert(
      {
        user_id: user.id,
        guide_step_id: stepId,
        completed: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,guide_step_id" },
    );
  }

  revalidatePath(`/juegos/${gameId}/guias`);
}
