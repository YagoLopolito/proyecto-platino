"use client";

import { useActionState, useEffect, useRef } from "react";
import { createGuide, type GuideActionState } from "./actions";

const initialState: GuideActionState = { error: null, success: null };

export default function AddGuideForm({ gameId }: { gameId: string }) {
  const [state, formAction, pending] = useActionState(createGuide, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <h3 className="text-sm font-semibold text-zinc-200">Nueva guía</h3>

      <div className="space-y-1">
        <label htmlFor="title" className="text-xs text-zinc-400">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="contentMarkdown" className="text-xs text-zinc-400">
          Contenido en markdown (opcional si pegás un link externo)
        </label>
        <textarea
          id="contentMarkdown"
          name="contentMarkdown"
          rows={5}
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-50"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="externalUrl" className="text-xs text-zinc-400">
            Link externo (opcional)
          </label>
          <input
            id="externalUrl"
            name="externalUrl"
            type="url"
            maxLength={500}
            placeholder="https://..."
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="source" className="text-xs text-zinc-400">
            Fuente (opcional)
          </label>
          <input
            id="source"
            name="source"
            type="text"
            maxLength={100}
            placeholder="PowerPyx, PSNProfiles..."
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-green-400">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {pending ? "Creando..." : "Crear guía"}
      </button>
    </form>
  );
}
