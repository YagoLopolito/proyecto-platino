"use client";

import { useId, useState } from "react";
import CatalogSearchCombobox from "@/components/diary/CatalogSearchCombobox";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";

export interface PickerGame {
  id: string;
  name: string;
  coverUrl: string | null;
  /** Lo estás jugando ahora (`now_playing`). */
  playing?: boolean;
}

function Cover({ game, className }: { game: PickerGame; className: string }) {
  const placeholder = (
    <span
      className={`flex items-center justify-center bg-surface-hover text-ink-faint ${className}`}
    >
      <Icon name="gamepad" className="h-4 w-4" />
    </span>
  );
  if (!game.coverUrl) return placeholder;
  return (
    <GameArt
      src={game.coverUrl}
      alt=""
      width={40}
      height={53}
      className={`object-cover ${className}`}
      fallback={placeholder}
    />
  );
}

/**
 * Selector del juego de una publicación (obligatorio). Arriba van los juegos
 * que estás jugando y después tus juegos recientes, en el orden de
 * `sortGamesPlayingFirst`; debajo, la búsqueda en TODO el catálogo
 * (`CatalogSearchCombobox`: lo que ya está en `games` + RAWG), así se puede
 * publicar de cualquier juego aunque no esté en tu biblioteca.
 */
export function GamePicker({
  options,
  value,
  onChange,
  disabled = false,
  error,
}: {
  /** Ya ordenadas: jugando primero. */
  options: PickerGame[];
  value: PickerGame | null;
  onChange: (game: PickerGame | null) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const [searching, setSearching] = useState(false);
  const headingId = useId();
  const searchInputId = useId();

  if (value) {
    return (
      <div className="space-y-1.5">
        <p id={headingId} className="type-meta text-ink-muted">
          Juego
        </p>
        <div className="flex items-center gap-3 rounded-card border border-border-strong bg-surface p-2">
          <Cover game={value} className="h-14 w-10 shrink-0 rounded-chip" />
          <p
            className="min-w-0 flex-1 truncate type-subtitle text-ink"
            data-testid="post-selected-game"
          >
            {value.name}
          </p>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="min-h-11 rounded-chip px-3 type-meta font-medium text-accent-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:min-h-0"
            >
              Cambiar juego
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${headingId}-error` : undefined}>
      <legend id={headingId} className="type-meta text-ink-muted">
        Juego <span className="text-ink-faint">(obligatorio)</span>
      </legend>

      {options.length > 0 && (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-label="Tus juegos">
          {options.map((game) => (
            <li key={game.id}>
              <button
                type="button"
                onClick={() => onChange(game)}
                className="flex w-full items-center gap-3 rounded-card p-1.5 text-left transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
              >
                <Cover game={game} className="h-12 w-9 shrink-0 rounded-chip" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate type-body text-ink">{game.name}</span>
                  {game.playing && (
                    <span className="block type-caption text-accent-ink">Jugando ahora</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searching || options.length === 0 ? (
        <div className="space-y-1.5">
          {/* El combobox trae su propio label ("Buscar juego") para este id. */}
          <CatalogSearchCombobox
            inputId={searchInputId}
            selectLabel="Elegir"
            onSelectGame={(id, picked) =>
              onChange({ id, name: picked.name, coverUrl: picked.coverUrl })
            }
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSearching(true)}
          className="flex min-h-11 items-center gap-2 rounded-chip px-1 type-meta font-medium text-accent-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:min-h-0"
        >
          <Icon name="search" className="h-4 w-4" />
          Buscar otro juego del catálogo
        </button>
      )}

      {error && (
        <p id={`${headingId}-error`} role="alert" className="type-meta text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
