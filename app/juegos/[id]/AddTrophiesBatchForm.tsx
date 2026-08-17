"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTrophiesBatch, type TrophyActionState } from "./actions";

const initialState: TrophyActionState = { error: null, success: null };

export default function AddTrophiesBatchForm({ gameId }: { gameId: string }) {
  const [state, formAction, pending] = useActionState(addTrophiesBatch, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50 p-4"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <h3 className="text-sm font-semibold text-zinc-200">Carga en lote</h3>
      <p className="text-xs text-zinc-500">
        Uno por línea, con el formato <code className="text-zinc-400">Nombre | tipo</code>. Tipo
        acepta bronce/plata/oro/platino (o bronze/silver/gold/platinum).
      </p>

      <textarea
        name="list"
        required
        rows={6}
        placeholder={"Primeros pasos | bronce\nMaestro de armas | plata\nFin del viaje | platino"}
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-50"
      />

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
        className="w-full rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
      >
        {pending ? "Agregando..." : "Agregar lista"}
      </button>
    </form>
  );
}
