"use client";

import { useState, useTransition } from "react";
import { stopPlaying } from "@/lib/now-playing/actions";

/**
 * "Dejé de jugarlo" debajo de una carátula de "Jugando ahora" (sólo en el
 * perfil propio). El nombre accesible lleva el juego: en una fila de pósters
 * hay varios botones con el mismo texto visible.
 */
export function StopPlayingButton({ gameId, gameName }: { gameId: string; gameName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={`Dejé de jugar ${gameName}`}
        onClick={() =>
          startTransition(async () => {
            const result = await stopPlaying(gameId);
            setError(result.error);
          })
        }
        className="mt-1 min-h-9 w-full rounded-chip type-caption text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:opacity-50"
      >
        {pending ? "Guardando..." : "Dejé de jugarlo"}
      </button>
      {error && (
        <p role="alert" className="type-caption text-danger">
          {error}
        </p>
      )}
    </>
  );
}
