"use client";

import { useActionState } from "react";
import { findExternalGuides, type FindExternalGuidesState } from "./actions";

const initialFindExternalGuidesState: FindExternalGuidesState = {
  inserted: null,
  errors: [],
};

export default function FindExternalGuidesButton({ gameId }: { gameId: string }) {
  const [state, formAction, pending] = useActionState(
    findExternalGuides,
    initialFindExternalGuidesState,
  );

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="gameId" value={gameId} />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-chip border border-accent-ink bg-accent/15 px-3 type-meta font-medium text-accent-ink transition-colors hover:bg-accent/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 disabled:opacity-50 sm:min-h-9"
        >
          {pending ? "Buscando..." : "Buscar guías externas"}
        </button>
      </form>

      {state.inserted !== null && (
        <p role="status" className="type-caption text-ink-muted">
          {state.inserted > 0
            ? `Se agregaron ${state.inserted} enlaces nuevos.`
            : "No se encontraron enlaces nuevos."}
        </p>
      )}

      {state.errors.length > 0 && (
        <p role="alert" className="type-caption text-danger">
          {state.errors.join(" ")}
        </p>
      )}
    </div>
  );
}
