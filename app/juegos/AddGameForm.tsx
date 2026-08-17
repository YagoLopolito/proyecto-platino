"use client";

import { useActionState, useEffect, useRef } from "react";
import { addGame, type GameActionState } from "./actions";

const initialState: GameActionState = { error: null, success: null };

export default function AddGameForm() {
  const [state, formAction, pending] = useActionState(addGame, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Limpiar el formulario tras un alta exitosa, para poder encadenar varias.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6"
    >
      <h2 className="text-lg font-semibold text-zinc-50">Agregar un juego</h2>

      <div className="space-y-1">
        <label htmlFor="name" className="text-sm text-zinc-400">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={200}
          placeholder="Bloodborne"
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="platform" className="text-sm text-zinc-400">
          Plataforma
        </label>
        <select
          id="platform"
          name="platform"
          required
          defaultValue=""
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50"
        >
          <option value="" disabled>
            Elegí una
          </option>
          <option value="PS5">PS5</option>
          <option value="PS4">PS4</option>
          <option value="PS3">PS3</option>
          <option value="PS Vita">PS Vita</option>
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="coverUrl" className="text-sm text-zinc-400">
          Carátula (URL, opcional)
        </label>
        <input
          id="coverUrl"
          name="coverUrl"
          type="url"
          placeholder="https://..."
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50"
        />
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
        className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {pending ? "Agregando..." : "Agregar a mi biblioteca"}
      </button>
    </form>
  );
}
