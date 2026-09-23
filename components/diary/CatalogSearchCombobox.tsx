"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { GameArt } from "@/components/game/GameArt";
import { useRouter } from "next/navigation";
import { searchCatalog, addCatalogGame, type AddCatalogGameState } from "@/lib/catalog/actions";
import { MIN_QUERY_LENGTH } from "@/lib/catalog/constants";
import type { CombinedSearchResult } from "@/lib/catalog/dedup";
import { Input, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";

const addInitialState: AddCatalogGameState = { error: null, success: null };

export type PickedGame = { name: string; coverUrl: string | null };
const DEBOUNCE_MS = 300;

/** Carátula del resultado, con placeholder cuando el juego no tiene imagen. */
function ResultCoverPlaceholder() {
  return (
    <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-chip bg-surface-hover type-caption text-ink-faint">
      Sin img
    </div>
  );
}

function ResultCover({ url, name }: { url: string | null; name: string }) {
  if (!url) return <ResultCoverPlaceholder />;
  return (
    <GameArt
      src={url}
      alt={name}
      width={56}
      height={80}
      className="h-20 w-14 shrink-0 rounded-chip object-cover"
      fallback={<ResultCoverPlaceholder />}
    />
  );
}

/**
 * Búsqueda de catálogo para el flujo global "Marcar como terminado": combina
 * juegos ya existentes en la biblioteca con resultados de lib/catalog
 * (RAWG vía lib/covers). Busca sola (debounce) a partir de MIN_QUERY_LENGTH
 * caracteres, sin botón. Al elegir un juego, lo da de alta (si hace falta) y
 * redirige a su ficha.
 *
 * Con `onSelectGame` (el "Marcar como jugando" del +, issue #187) no navega:
 * le pasa el `games.id` elegido al caller, ya dado de alta si venía del
 * catálogo.
 */
export default function CatalogSearchCombobox({
  onSelectGame,
  selectLabel = "Elegir",
  inputId = "catalog-query",
}: {
  /**
   * El juego elegido, ya dado de alta si venía de RAWG. Lleva nombre y
   * carátula para quien tiene que mostrarlo sin volver a pedirlo (el editor de
   * listas, #189).
   */
  onSelectGame?: (gameId: string, game: PickedGame) => void;
  selectLabel?: string;
  inputId?: string;
} = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CombinedSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "missing_api_key" | "error">("idle");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [pendingDuplicate, setPendingDuplicate] = useState<CombinedSearchResult | null>(null);

  const [addState, addAction, addPending] = useActionState(addCatalogGame, addInitialState);

  // Navegación real (efecto imperativo del browser), no sincronización de
  // estado -- por eso va en un effect y no ajustado durante el render.
  // Cada resultado del alta se atiende una sola vez: el effect también corre
  // si cambia la identidad de `onSelectGame`, y marcar dos veces el mismo
  // juego como jugando choca con el unique.
  const handledAddState = useRef<AddCatalogGameState | null>(null);
  // El resultado de catálogo que se mandó a dar de alta: la action devuelve
  // sólo el id, y quien elige necesita también el nombre y la carátula.
  const submittedPick = useRef<PickedGame>({ name: "", coverUrl: null });
  useEffect(() => {
    if (handledAddState.current === addState) return;
    handledAddState.current = addState;
    if (addState.success && addState.gameId) {
      if (onSelectGame) onSelectGame(addState.gameId, submittedPick.current);
      else router.push(`/juegos/${addState.gameId}`);
    }
  }, [addState, router, onSelectGame]);

  // Búsqueda automática con debounce: pedido a la Server Action (efecto
  // externo), no sincronización de estado -- los setState pasan dentro del
  // callback async del timer, no durante el render del efecto.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // Los resultados viejos se ocultan derivándolos del query durante el
      // render (ver `active` más abajo), no limpiando el estado acá: un
      // setState sincrónico dentro de un effect dispara el lint
      // react-hooks/set-state-in-effect (ver convenciones en CLAUDE.md).
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const outcome = await searchCatalog(trimmed);
        if (cancelled) return;
        if (outcome.status === "missing_api_key") {
          setSearchStatus("missing_api_key");
          setSearchMessage(
            "La búsqueda de catálogo externo no está disponible (falta configurar RAWG_API_KEY). Mostrando solo juegos ya conocidos.",
          );
          setResults(outcome.results);
        } else if (outcome.status === "error") {
          setSearchStatus("error");
          setSearchMessage(outcome.message);
          setResults([]);
        } else {
          setSearchStatus("idle");
          setSearchMessage(null);
          setResults(outcome.results);
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function selectLibraryGame(result: CombinedSearchResult) {
    const gameId = result.gameId!;
    if (onSelectGame) onSelectGame(gameId, { name: result.name, coverUrl: result.coverUrl });
    else router.push(`/juegos/${gameId}`);
  }

  function rememberPick(result: CombinedSearchResult) {
    submittedPick.current = { name: result.name, coverUrl: result.coverUrl };
  }

  // Mientras el query es más corto que el mínimo no se muestra nada de la
  // búsqueda anterior -- derivado, no estado.
  const trimmedQuery = query.trim();
  const active = trimmedQuery.length >= MIN_QUERY_LENGTH;
  const visibleResults = active ? results : [];
  const visibleMessage = active ? searchMessage : null;
  const tooShort = trimmedQuery.length > 0 && !active;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor={inputId}>Buscar juego</Label>
        <Input
          id={inputId}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre del juego..."
        />
        <p className="type-caption text-ink-faint" aria-live="polite">
          {tooShort
            ? `Escribí al menos ${MIN_QUERY_LENGTH} caracteres.`
            : isSearching
              ? "Buscando..."
              : " "}
        </p>
      </div>

      {visibleMessage && (
        <p
          role={searchStatus === "error" ? "alert" : "status"}
          className="type-body text-ink-muted"
        >
          {visibleMessage}
        </p>
      )}

      {active && !isSearching && !visibleMessage && visibleResults.length === 0 && (
        <p className="type-body text-ink-muted">No encontramos juegos con ese nombre.</p>
      )}

      {visibleResults.length > 0 && (
        <ul className="space-y-2">
          {visibleResults.map((result) => {
            const key = result.gameId ?? result.externalId ?? result.name;
            const isDuplicatePending = pendingDuplicate?.name === result.name;
            return (
              <li
                key={key}
                className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ResultCover url={result.coverUrl} name={result.name} />
                  <div className="min-w-0">
                    <p className="truncate type-subtitle text-ink">{result.name}</p>
                    <p className="truncate type-meta text-ink-faint">
                      {[
                        result.releaseYear ? String(result.releaseYear) : null,
                        result.platform,
                        result.source === "library" ? "En tu biblioteca" : "Catálogo",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>

                {result.source === "library" && result.gameId && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full shrink-0 sm:w-auto"
                    onClick={() => selectLibraryGame(result)}
                  >
                    {selectLabel}
                  </Button>
                )}

                {result.source === "catalog" &&
                  result.possibleDuplicateOf &&
                  !isDuplicatePending && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full shrink-0 sm:w-auto"
                      onClick={() => setPendingDuplicate(result)}
                    >
                      ¿Es el mismo juego?
                    </Button>
                  )}

                {result.source === "catalog" &&
                  result.possibleDuplicateOf &&
                  isDuplicatePending && (
                    <div className="flex w-full shrink-0 flex-col gap-1 type-meta sm:w-auto sm:items-end">
                      <p className="text-ink-muted">
                        ¿Es el mismo juego que &quot;{result.possibleDuplicateOf.name}&quot;?
                      </p>
                      <div className="flex gap-2">
                        <form
                          action={addAction}
                          onSubmit={() => rememberPick(result)}
                          className="flex-1 sm:flex-none"
                        >
                          <input type="hidden" name="externalId" value={result.externalId} />
                          <input type="hidden" name="name" value={result.name} />
                          <input type="hidden" name="coverUrl" value={result.coverUrl ?? ""} />
                          <input
                            type="hidden"
                            name="confirmedDuplicateOfGameId"
                            value={result.possibleDuplicateOf.gameId}
                          />
                          <Button type="submit" disabled={addPending} className="w-full">
                            Sí, es el mismo
                          </Button>
                        </form>
                        <form
                          action={addAction}
                          onSubmit={() => rememberPick(result)}
                          className="flex-1 sm:flex-none"
                        >
                          <input type="hidden" name="externalId" value={result.externalId} />
                          <input type="hidden" name="name" value={result.name} />
                          <input type="hidden" name="coverUrl" value={result.coverUrl ?? ""} />
                          <Button
                            type="submit"
                            variant="secondary"
                            disabled={addPending}
                            className="w-full"
                          >
                            No, es distinto
                          </Button>
                        </form>
                      </div>
                    </div>
                  )}

                {result.source === "catalog" && !result.possibleDuplicateOf && (
                  <form action={addAction} onSubmit={() => rememberPick(result)}>
                    <input type="hidden" name="externalId" value={result.externalId} />
                    <input type="hidden" name="name" value={result.name} />
                    <input type="hidden" name="coverUrl" value={result.coverUrl ?? ""} />
                    <Button
                      type="submit"
                      disabled={addPending}
                      className="w-full shrink-0 sm:w-auto"
                    >
                      {addPending ? "Agregando..." : "Agregar"}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <FormError>{addState.error}</FormError>
    </div>
  );
}
