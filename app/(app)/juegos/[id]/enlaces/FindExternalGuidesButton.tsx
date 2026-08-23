"use client";

import { useActionState } from "react";
import { findExternalGuides, type FindExternalGuidesState } from "./actions";

const initialFindExternalGuidesState: FindExternalGuidesState = {
  inserted: null,
  errors: [],
};

export default function FindExternalGuidesButton({
  gameId,
  gameName,
}: {
  gameId: string;
  gameName: string;
}) {
  const [state, formAction, pending] = useActionState(
    findExternalGuides,
    initialFindExternalGuidesState,
  );

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="gameId" value={gameId} />
        <input type="hidden" name="gameName" value={gameName} />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-blue-700 bg-blue-900/30 px-3 py-1.5 text-sm text-blue-300 hover:border-blue-500 disabled:opacity-50"
        >
          {pending ? "Buscando..." : "Buscar guías de trofeos"}
        </button>
      </form>

      {state.inserted !== null && (
        <p role="status" className="text-xs text-zinc-500">
          {state.inserted > 0
            ? `Se encontraron ${state.inserted} guías.`
            : "No se encontraron guías."}
        </p>
      )}

      {state.errors.length > 0 && (
        <p role="alert" className="text-xs text-red-400">
          {state.errors.join(" ")}
        </p>
      )}
    </div>
  );
}
