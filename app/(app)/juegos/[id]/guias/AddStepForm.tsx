"use client";

import { useActionState, useEffect, useRef } from "react";
import { addStep, type GuideActionState } from "./actions";

const initialState: GuideActionState = { error: null, success: null };

export default function AddStepForm({
  guideId,
  gameId,
  nextOrder,
  trophies,
}: {
  guideId: string;
  gameId: string;
  nextOrder: number;
  trophies: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(addStep, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-start gap-2 pt-2">
      <input type="hidden" name="guideId" value={guideId} />
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="stepOrder" value={nextOrder} />

      <input
        name="content"
        type="text"
        required
        maxLength={500}
        placeholder="Descripción del paso"
        className="min-w-[12rem] flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-50"
      />

      {trophies.length > 0 && (
        <select
          name="trophyId"
          defaultValue=""
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
        className="shrink-0 rounded bg-zinc-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
      >
        {pending ? "..." : "Agregar paso"}
      </button>

      {state.error && (
        <p role="alert" className="w-full text-xs text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
