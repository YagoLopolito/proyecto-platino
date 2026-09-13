"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input, Label } from "@/components/Input";
import { FormError, FormSuccess } from "@/components/FormError";
import { GameArt } from "@/components/game/GameArt";
import { SectionAction } from "@/components/ui/SectionHeader";
import { saveFavoriteGames, type FavoritesActionState } from "@/app/(app)/perfil/actions";
import { MAX_FAVORITE_GAMES } from "@/lib/profile/constants";

export type FavoriteCandidate = {
  id: string;
  name: string;
  imageUrl: string | null;
};

const initialState: FavoritesActionState = { error: null, success: null };

/**
 * Editor del Top 5 del perfil: un modal con la biblioteca del usuario, donde
 * clickear un juego lo agrega al final de la lista y volver a clickearlo lo
 * saca. El orden de selección **es** el orden del Top 5 (el número de puesto se
 * muestra sobre la carátula elegida), así no hace falta un drag & drop para
 * ordenar cinco elementos.
 *
 * La biblioteca llega por props desde el Server Component: es la misma consulta
 * que el perfil ya hace para contar los juegos, así que filtrar en el cliente
 * no cuesta un round-trip extra.
 */
export function TopFiveEditor({
  games,
  selectedIds,
}: {
  games: FavoriteCandidate[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [query, setQuery] = useState("");
  const [state, formAction, pending] = useActionState(saveFavoriteGames, initialState);

  // Cerrar el modal al guardar bien, ajustando el estado durante el render
  // (regla react-hooks/set-state-in-effect, ver CLAUDE.md).
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setOpen(false);
  }

  const term = query.trim().toLowerCase();
  const visible = term ? games.filter((game) => game.name.toLowerCase().includes(term)) : games;

  function toggle(gameId: string) {
    setSelected((current) =>
      current.includes(gameId)
        ? current.filter((id) => id !== gameId)
        : current.length >= MAX_FAVORITE_GAMES
          ? current
          : [...current, gameId],
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        <SectionAction>{selectedIds.length > 0 ? "Editar" : "Elegir"}</SectionAction>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Elegí tu Top ${MAX_FAVORITE_GAMES}`}
        description="Clickeá los juegos que querés mostrar en tu perfil. El orden en que los elegís es el orden en que se muestran."
      >
        <form action={formAction} className="space-y-4">
          {selected.map((gameId) => (
            <input key={gameId} type="hidden" name="gameIds" value={gameId} />
          ))}

          <div className="space-y-1">
            <Label htmlFor="favorite-query" className="text-xs">
              Buscar en tu biblioteca
            </Label>
            <Input
              id="favorite-query"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre del juego..."
              className="text-sm"
            />
            <p className="text-xs text-zinc-500" aria-live="polite">
              {selected.length} de {MAX_FAVORITE_GAMES} elegidos
            </p>
          </div>

          {games.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Todavía no tenés juegos en tu biblioteca: sincronizá una cuenta para poder armar tu
              Top {MAX_FAVORITE_GAMES}.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-zinc-500">Ningún juego coincide.</p>
          ) : (
            <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {visible.map((game) => {
                const rank = selected.indexOf(game.id);
                const isSelected = rank >= 0;
                return (
                  <li key={game.id}>
                    <button
                      type="button"
                      onClick={() => toggle(game.id)}
                      aria-pressed={isSelected}
                      title={game.name}
                      data-testid="favorite-candidate"
                      className={`block w-full overflow-hidden rounded-md border text-left transition ${
                        isSelected
                          ? "border-blue-500 ring-2 ring-blue-500/40"
                          : "border-zinc-800 hover:border-zinc-500"
                      }`}
                    >
                      <span className="relative block aspect-[3/4] w-full bg-zinc-900">
                        {game.imageUrl && (
                          <GameArt
                            src={game.imageUrl}
                            alt=""
                            sizes="120px"
                            className="object-cover"
                            fallback={null}
                          />
                        )}
                        {isSelected && (
                          <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                            #{rank + 1}
                          </span>
                        )}
                      </span>
                      <span className="block px-1.5 py-1 text-[11px] leading-tight text-zinc-300">
                        <span className="line-clamp-2">{game.name}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <FormError>{state.error}</FormError>
          <FormSuccess>{state.success}</FormSuccess>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSelected([])}>
              Vaciar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando..." : "Guardar Top 5"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
