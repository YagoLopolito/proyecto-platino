"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTrophy, type TrophyActionState } from "./actions";

const initialState: TrophyActionState = { error: null, success: null };

export default function AddTrophyForm({ gameId }: { gameId: string }) {
  const [state, formAction, pending] = useActionState(addTrophy, initialState);
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
      <h3 className="text-sm font-semibold text-zinc-200">Agregar un trofeo</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="name" className="text-xs text-zinc-400">
            Nombre
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={200}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="description" className="text-xs text-zinc-400">
            Descripción (opcional)
          </label>
          <input
            id="description"
            name="description"
            type="text"
            maxLength={500}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="type" className="text-xs text-zinc-400">
            Tipo
          </label>
          <select
            id="type"
            name="type"
            required
            defaultValue=""
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
          >
            <option value="" disabled>
              Elegí uno
            </option>
            <option value="bronze">Bronce</option>
            <option value="silver">Plata</option>
            <option value="gold">Oro</option>
            <option value="platinum">Platino</option>
          </select>
        </div>

        <label className="flex items-center gap-2 self-end pb-2 text-xs text-zinc-400">
          <input type="checkbox" name="hidden" className="rounded border-zinc-700 bg-zinc-800" />
          Trofeo oculto
        </label>
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
        {pending ? "Agregando..." : "Agregar trofeo"}
      </button>
    </form>
  );
}
