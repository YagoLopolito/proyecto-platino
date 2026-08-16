"use client";

import { useActionState } from "react";
import { connectPsnAccount, type PsnActionState } from "./actions";

const initialState: PsnActionState = { error: null, success: null };

export function ConnectPsnForm() {
  const [state, formAction, pending] = useActionState(connectPsnAccount, initialState);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
    >
      <label htmlFor="npsso" className="text-sm text-zinc-400">
        NPSSO
      </label>
      <textarea
        id="npsso"
        name="npsso"
        required
        rows={3}
        placeholder="Pegá acá tu NPSSO"
        className="w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-50"
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      {state.success && <p className="text-sm text-emerald-400">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Conectando..." : "Conectar cuenta PSN"}
      </button>
    </form>
  );
}
