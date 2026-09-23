"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { dismissPlaySuggestion, startPlaying } from "@/lib/now-playing/actions";

/**
 * "¿Empezaste X?" arriba de la biblioteca (issue #187). Sale del
 * `last_played_at` que trae el sync, pero **nunca marca solo**: la decisión es
 * del usuario. Descartar lo esconde hasta que el sync vea una sesión nueva de
 * ese juego.
 *
 * Una línea y no una tarjeta: es una pregunta al pasar, no contenido.
 */
export function PlaySuggestionBanner({ gameId, gameName }: { gameId: string; gameName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: (id: string) => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(gameId);
      if (result.error) setError(result.error);
    });
  }

  const linkClass =
    "min-h-9 rounded-chip px-2 type-meta font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:opacity-50";

  return (
    <aside
      aria-label="Sugerencia de jugando ahora"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-border bg-surface px-3 py-2"
    >
      <p className="flex min-w-0 flex-1 items-center gap-2 type-body text-ink">
        <Icon name="gamepad" className="h-4 w-4 shrink-0 text-accent-ink" />
        <span className="min-w-0">
          ¿Empezaste <span className="font-semibold">{gameName}</span>?
        </span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(startPlaying)}
          className={`${linkClass} text-accent-ink hover:bg-accent/15`}
        >
          Marcar como jugando
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(dismissPlaySuggestion)}
          className={`${linkClass} text-ink-muted hover:bg-surface-hover hover:text-ink`}
        >
          Descartar
        </button>
      </div>
      {error && (
        <p role="alert" className="w-full type-caption text-danger">
          {error}
        </p>
      )}
    </aside>
  );
}
