"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { searchCatalog, addCatalogGame, type AddCatalogGameState } from "@/lib/catalog/actions";
import { MIN_QUERY_LENGTH } from "@/lib/catalog/constants";
import type { CombinedSearchResult } from "@/lib/catalog/dedup";
import { Input, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";

const addInitialState: AddCatalogGameState = { error: null, success: null };
const DEBOUNCE_MS = 300;

/** Carátula del resultado, con placeholder cuando el juego no tiene imagen. */
function ResultCover({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-500">
        Sin img
      </div>
    );
  }
  return (
    <Image
      src={url}
      alt={name}
      width={56}
      height={56}
      className="h-14 w-14 shrink-0 rounded object-cover"
    />
  );
}

/**
 * Búsqueda de catálogo para el flujo global "Marcar como terminado": combina
 * juegos ya existentes en la biblioteca con resultados de lib/catalog
 * (RAWG vía lib/covers). Busca sola (debounce) a partir de MIN_QUERY_LENGTH
 * caracteres, sin botón. Al elegir un juego, lo da de alta (si hace falta) y
 * redirige a su diario.
 */
export default function CatalogSearchCombobox() {
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
  useEffect(() => {
    if (addState.success && addState.gameId) {
      router.push(`/juegos/${addState.gameId}/diario`);
    }
  }, [addState, router]);

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

  function selectLibraryGame(gameId: string) {
    router.push(`/juegos/${gameId}/diario`);
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
        <Label htmlFor="catalog-query" className="text-xs">
          Buscar juego
        </Label>
        <Input
          id="catalog-query"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre del juego..."
          className="text-sm"
        />
        <p className="text-xs text-zinc-500" aria-live="polite">
          {tooShort
            ? `Escribí al menos ${MIN_QUERY_LENGTH} caracteres.`
            : isSearching
              ? "Buscando..."
              : " "}
        </p>
      </div>

      {visibleMessage && (
        <p role={searchStatus === "error" ? "alert" : "status"} className="text-sm text-zinc-400">
          {visibleMessage}
        </p>
      )}

      {active && !isSearching && !visibleMessage && visibleResults.length === 0 && (
        <p className="text-sm text-zinc-500">No encontramos juegos con ese nombre.</p>
      )}

      {visibleResults.length > 0 && (
        <ul className="space-y-2">
          {visibleResults.map((result) => {
            const key = result.gameId ?? result.externalId ?? result.name;
            const isDuplicatePending = pendingDuplicate?.name === result.name;
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ResultCover url={result.coverUrl} name={result.name} />
                  <span className="min-w-0 truncate text-sm text-zinc-200">{result.name}</span>
                </div>

                {result.source === "library" && result.gameId && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 text-xs"
                    onClick={() => selectLibraryGame(result.gameId!)}
                  >
                    Elegir
                  </Button>
                )}

                {result.source === "catalog" &&
                  result.possibleDuplicateOf &&
                  !isDuplicatePending && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 text-xs"
                      onClick={() => setPendingDuplicate(result)}
                    >
                      ¿Es el mismo juego?
                    </Button>
                  )}

                {result.source === "catalog" &&
                  result.possibleDuplicateOf &&
                  isDuplicatePending && (
                    <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                      <p className="text-zinc-400">
                        ¿Es el mismo juego que &quot;{result.possibleDuplicateOf.name}&quot;?
                      </p>
                      <div className="flex gap-2">
                        <form action={addAction}>
                          <input type="hidden" name="externalId" value={result.externalId} />
                          <input type="hidden" name="name" value={result.name} />
                          <input type="hidden" name="coverUrl" value={result.coverUrl ?? ""} />
                          <input
                            type="hidden"
                            name="confirmedDuplicateOfGameId"
                            value={result.possibleDuplicateOf.gameId}
                          />
                          <Button type="submit" disabled={addPending} className="text-xs">
                            Sí, es el mismo
                          </Button>
                        </form>
                        <form action={addAction}>
                          <input type="hidden" name="externalId" value={result.externalId} />
                          <input type="hidden" name="name" value={result.name} />
                          <input type="hidden" name="coverUrl" value={result.coverUrl ?? ""} />
                          <Button type="submit" variant="secondary" disabled={addPending} className="text-xs">
                            No, es distinto
                          </Button>
                        </form>
                      </div>
                    </div>
                  )}

                {result.source === "catalog" && !result.possibleDuplicateOf && (
                  <form action={addAction}>
                    <input type="hidden" name="externalId" value={result.externalId} />
                    <input type="hidden" name="name" value={result.name} />
                    <input type="hidden" name="coverUrl" value={result.coverUrl ?? ""} />
                    <Button type="submit" disabled={addPending} className="shrink-0 text-xs">
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
