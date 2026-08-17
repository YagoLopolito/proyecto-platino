"use client";

import { useActionState, useState } from "react";
import { updateStep, type GuideActionState } from "./actions";

const initialState: GuideActionState = { error: null, success: null };

export default function EditStepForm({
  gameId,
  guideId,
  step,
  trophies,
}: {
  gameId: string;
  guideId: string;
  step: { id: string; content: string; trophy_id: string | null };
  trophies: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateStep, initialState);

  // Cerrar el form al confirmarse un submit exitoso, ajustando el estado
  // durante el render (patrón oficial de React) en vez de con un effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 text-xs text-zinc-500 hover:text-blue-400"
      >
        Editar
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex w-full flex-wrap items-start gap-2 rounded border border-zinc-700 bg-zinc-950 p-2"
    >
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="guideId" value={guideId} />
      <input type="hidden" name="gameId" value={gameId} />

      <input
        name="content"
        type="text"
        required
        maxLength={500}
        defaultValue={step.content}
        className="min-w-[12rem] flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-50"
      />

      {trophies.length > 0 && (
        <select
          name="trophyId"
          defaultValue={step.trophy_id ?? ""}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-50"
        >
          <option value="">Sin trofeo asociado</option>
          {trophies.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {pending ? "..." : "Guardar"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="shrink-0 rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
      >
        Cancelar
      </button>

      {state.error && (
        <p role="alert" className="w-full text-xs text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
