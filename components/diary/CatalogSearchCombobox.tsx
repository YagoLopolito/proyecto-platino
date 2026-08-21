"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchCatalog, addCatalogGame, type AddCatalogGameState } from "@/lib/catalog/actions";
import type { CombinedSearchResult } from "@/lib/catalog/dedup";
import { Input, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";

const addInitialState: AddCatalogGameState = { error: null, success: null };

/**
 * Búsqueda de catálogo para el flujo global "Marcar como terminado": combina
 * juegos ya existentes en la biblioteca con resultados de lib/catalog
 * (RAWG vía lib/covers). Al elegir un juego, lo da de alta (si hace falta) y
 * redirige a su diario.
 */
export default function CatalogSearchCombobox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CombinedSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "missing_api_key" | "error" | "">("");
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    startSearch(async () => {
      const outcome = await searchCatalog(query);
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
  }

  function selectLibraryGame(gameId: string) {
    router.push(`/juegos/${gameId}/diario`);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="catalog-query" className="text-xs">
            Buscar juego
          </Label>
          <Input
            id="catalog-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre del juego..."
            className="text-sm"
          />
        </div>
        <Button type="submit" disabled={isSearching || query.trim().length < 2}>
          {isSearching ? "Buscando..." : "Buscar"}
        </Button>
      </form>

      {searchMessage && (
        <p role={searchStatus === "error" ? "alert" : "status"} className="text-sm text-zinc-400">
          {searchMessage}
        </p>
      )}

      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((result) => {
            const key = result.gameId ?? result.externalId ?? result.name;
            const isDuplicatePending = pendingDuplicate?.name === result.name;
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900 p-3"
              >
                <span className="min-w-0 truncate text-sm text-zinc-200">{result.name}</span>

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
