"use client";

import { useActionState } from "react";
import { connectPsnAccount, type PsnActionState } from "./actions";

const initialState: PsnActionState = { error: null, success: null };

export default function ConnectPsnForm() {
  const [state, formAction, pending] = useActionState(connectPsnAccount, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-lg font-semibold text-zinc-50">Conectar cuenta PSN</h2>

      <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-400">
        <li>
          Iniciá sesión en{" "}
          <a
            href="https://www.playstation.com"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline"
          >
            playstation.com
          </a>
          .
        </li>
        <li>
          En el mismo navegador, entrá a{" "}
          <a
            href="https://ca.account.sony.com/api/v1/ssocookie"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline"
          >
            ca.account.sony.com/api/v1/ssocookie
          </a>
          .
        </li>
        <li>Copiá el valor de &quot;npsso&quot; del JSON que aparece.</li>
      </ol>

      <div className="space-y-1">
        <label htmlFor="npsso" className="text-sm text-zinc-400">
          NPSSO
        </label>
        <textarea
          id="npsso"
          name="npsso"
          required
          rows={3}
          placeholder="Pegá acá tu NPSSO"
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-50"
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
        {pending ? "Conectando..." : "Conectar"}
      </button>
    </form>
  );
}
