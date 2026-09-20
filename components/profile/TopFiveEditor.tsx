"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input, Label } from "@/components/Input";
import { FormError, FormSuccess } from "@/components/FormError";
import { GameArt } from "@/components/game/GameArt";
import { SectionAction } from "@/components/ui/SectionHeader";
import { saveFavoriteGames, type FavoritesActionState } from "@/app/(app)/perfil/actions";
import { MAX_FAVORITE_GAMES } from "@/lib/profile/constants";
import { searchCatalog, addCatalogGame } from "@/lib/catalog/actions";
import { MIN_QUERY_LENGTH } from "@/lib/catalog/constants";
import type { CombinedSearchResult } from "@/lib/catalog/dedup";

export type FavoriteCandidate = {
  id: string;
  name: string;
  imageUrl: string | null;
};

const initialState: FavoritesActionState = { error: null, success: null };

/**
 * Debounce del filtro y de la búsqueda de catálogo. Sin esto la grilla se
 * reordenaba con cada tecla y el juego que el usuario estaba por tocar se movía
 * de lugar entre la letra y el tap.
 */
const DEBOUNCE_MS = 250;

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
 *
 * Lo que **no** está en la biblioteca (juegos de PC, de consolas que la app no
 * sincroniza, o clásicos que nunca se jugaron en la cuenta conectada) se busca
 * en el catálogo (RAWG, vía `lib/catalog/`) y se da de alta igual que en
 * "Marcar como terminado": el Top 5 es una decisión del usuario sobre sus
 * juegos favoritos, no un recorte de lo que PSN y Steam le sincronizaron.
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
  const [term, setTerm] = useState("");
  const [state, formAction, pending] = useActionState(saveFavoriteGames, initialState);

  // Juegos dados de alta desde el catálogo en esta sesión del modal: el perfil
  // (Server Component) todavía no los tiene en sus props, pero ya existen en
  // `user_games`, que es lo que valida la Server Action al guardar.
  const [added, setAdded] = useState<FavoriteCandidate[]>([]);
  const [catalogResults, setCatalogResults] = useState<CombinedSearchResult[]>([]);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isAdding, startAdd] = useTransition();

  // Cerrar el modal al guardar bien, ajustando el estado durante el render
  // (regla react-hooks/set-state-in-effect, ver CLAUDE.md).
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setOpen(false);
  }

  // Debounce del texto tipeado. Los setState pasan dentro del callback del
  // timer, no durante el render del effect (ver convenciones en CLAUDE.md).
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const allGames = [...added, ...games];
  const lowerTerm = term.toLowerCase();
  const visible = lowerTerm
    ? allGames.filter((game) => game.name.toLowerCase().includes(lowerTerm))
    : allGames;

  // La búsqueda de catálogo sólo sale a la red cuando el usuario escribió algo
  // que su biblioteca no cubre: si el juego ya lo tiene, no hay nada que dar de
  // alta.
  const shouldSearchCatalog = term.length >= MIN_QUERY_LENGTH && visible.length === 0;

  useEffect(() => {
    if (!open || !shouldSearchCatalog) return;

    let cancelled = false;
    startSearch(async () => {
      const outcome = await searchCatalog(term);
      if (cancelled) return;
      if (outcome.status === "error") {
        setCatalogResults([]);
        setCatalogMessage(outcome.message);
      } else {
        setCatalogResults(outcome.results);
        setCatalogMessage(
          outcome.status === "missing_api_key"
            ? "La búsqueda de catálogo externo no está disponible (falta configurar RAWG_API_KEY)."
            : null,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, term, shouldSearchCatalog]);

  // Los resultados de una búsqueda anterior se ocultan derivándolos, no
  // limpiando el estado dentro del effect.
  const visibleCatalogResults = shouldSearchCatalog ? catalogResults : [];

  function toggle(gameId: string) {
    setSelected((current) =>
      current.includes(gameId)
        ? current.filter((id) => id !== gameId)
        : current.length >= MAX_FAVORITE_GAMES
          ? current
          : [...current, gameId],
    );
  }

  /**
   * Suma al Top 5 un juego que no está en la biblioteca del usuario. Siempre
   * pasa por `addCatalogGame`, incluso cuando la fila de `games` ya existe
   * (la creó otro usuario al sincronizar): sin ese alta no queda vinculado en
   * `user_games` y la Server Action del Top 5 lo rechazaría al guardar.
   */
  function addFromCatalog(result: CombinedSearchResult) {
    const externalId = result.externalId ?? result.gameId;
    if (!externalId) return;

    startAdd(async () => {
      const formData = new FormData();
      formData.set("externalId", externalId);
      formData.set("name", result.name);
      if (result.coverUrl) formData.set("coverUrl", result.coverUrl);
      // Una fila que ya existe se vincula, nunca se duplica: es el mismo camino
      // que usa "Marcar como terminado" cuando el usuario confirma un remaster.
      if (result.gameId) formData.set("confirmedDuplicateOfGameId", result.gameId);

      const outcome = await addCatalogGame({ error: null }, formData);
      if (outcome.error || !outcome.gameId) {
        setCatalogMessage(outcome.error ?? "No se pudo agregar el juego.");
        return;
      }
      const gameId = outcome.gameId;
      setCatalogMessage(null);
      setAdded((current) =>
        current.some((game) => game.id === gameId)
          ? current
          : [{ id: gameId, name: result.name, imageUrl: result.coverUrl }, ...current],
      );
      setSelected((current) =>
        current.includes(gameId) || current.length >= MAX_FAVORITE_GAMES
          ? current
          : [...current, gameId],
      );
    });
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
            <Label htmlFor="favorite-query">Buscar en tu biblioteca</Label>
            <Input
              id="favorite-query"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre del juego..."
            />
            <p className="text-xs text-zinc-500" aria-live="polite">
              {selected.length} de {MAX_FAVORITE_GAMES} elegidos
            </p>
          </div>

          {allGames.length === 0 && !shouldSearchCatalog ? (
            <p className="text-sm text-zinc-500">
              Todavía no tenés juegos en tu biblioteca: sincronizá una cuenta o buscá cualquier
              juego por nombre para armar tu Top {MAX_FAVORITE_GAMES}.
            </p>
          ) : visible.length > 0 ? (
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
          ) : (
            <p className="text-sm text-zinc-500">
              {term.length >= MIN_QUERY_LENGTH
                ? "Ningún juego de tu biblioteca coincide."
                : "Ningún juego coincide."}
            </p>
          )}

          {shouldSearchCatalog && (
            <div className="space-y-2" data-testid="favorite-catalog-results">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {isSearching ? "Buscando en el catálogo..." : "Agregar desde el catálogo"}
              </p>
              {catalogMessage && <p className="text-sm text-zinc-400">{catalogMessage}</p>}
              {!isSearching && !catalogMessage && visibleCatalogResults.length === 0 && (
                <p className="text-sm text-zinc-500">No encontramos juegos con ese nombre.</p>
              )}
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {visibleCatalogResults.map((result) => (
                  <li key={result.gameId ?? result.externalId ?? result.name}>
                    <button
                      type="button"
                      disabled={isAdding}
                      onClick={() => addFromCatalog(result)}
                      data-testid="favorite-catalog-result"
                      className="flex w-full items-center gap-3 rounded-md border border-zinc-800 p-2 text-left transition hover:border-zinc-500 disabled:opacity-60"
                    >
                      <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded bg-zinc-900">
                        {result.coverUrl && (
                          <GameArt
                            src={result.coverUrl}
                            alt=""
                            sizes="48px"
                            className="object-cover"
                            fallback={null}
                          />
                        )}
                      </span>
                      <span className="min-w-0 text-sm text-zinc-200">
                        <span className="block truncate">{result.name}</span>
                        {result.releaseYear && (
                          <span className="block text-xs text-zinc-500">{result.releaseYear}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <FormError>{state.error}</FormError>
          <FormSuccess>{state.success}</FormSuccess>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSelected([])}>
              Vaciar
            </Button>
            <Button type="submit" disabled={pending || isAdding}>
              {pending ? "Guardando..." : "Guardar Top 5"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
