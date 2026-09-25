"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { FormError } from "@/components/FormError";
import { Icon } from "@/components/ui/Icon";
import { getMyListsForGame, toggleGameInList, type ListsForGameResult } from "@/lib/lists/actions";

/**
 * El contenido de "Agregar a una lista" en la ficha de un juego (epic #183,
 * issue #189): tus listas con un tilde en las que ya lo tienen, y "Nueva lista
 * con este juego". Cada fila es un toggle con `aria-pressed`, así se lee como
 * "está / no está" y no como una acción suelta.
 *
 * Las listas se piden al abrir (esto se monta con el diálogo), no al renderizar
 * la ficha: la mayoría de las visitas no lo abren.
 */
export function AddToListPanel({
  gameId,
  onDone,
  onChange,
}: {
  gameId: string;
  onDone: () => void;
  /** +1 / -1 al agregar o sacar el juego de una lista: el panel de la ficha lleva la cuenta. */
  onChange?: (delta: 1 | -1) => void;
}) {
  const [result, setResult] = useState<ListsForGameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingListId, setPendingListId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Pedido a una Server Action (efecto externo): el setState ocurre en el
  // callback de la promesa, no sincrónicamente dentro del effect.
  useEffect(() => {
    let cancelled = false;
    getMyListsForGame(gameId).then((outcome) => {
      if (!cancelled) setResult(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  function setContains(listId: string, containsGame: boolean) {
    setResult((current) =>
      current?.status === "ok"
        ? {
            status: "ok",
            lists: current.lists.map((list) =>
              list.id === listId && list.containsGame !== containsGame
                ? {
                    ...list,
                    containsGame,
                    itemCount: list.itemCount + (containsGame ? 1 : -1),
                  }
                : list,
            ),
          }
        : current,
    );
    onChange?.(containsGame ? 1 : -1);
  }

  // Optimista: el tilde cambia al tocar y, si la action falla, vuelve.
  function toggle(listId: string, containsGame: boolean) {
    setError(null);
    setPendingListId(listId);
    setContains(listId, !containsGame);
    startTransition(async () => {
      const outcome = await toggleGameInList(listId, gameId);
      setPendingListId(null);
      if (outcome.error) {
        setContains(listId, containsGame);
        setError(outcome.error);
      }
    });
  }

  if (!result) {
    return <p className="type-body text-ink-muted">Cargando tus listas...</p>;
  }
  if (result.status === "error") {
    return <FormError>{result.message}</FormError>;
  }

  return (
    <div className="space-y-4">
      {result.lists.length === 0 ? (
        <p className="type-body text-ink-muted">Todavía no tenés listas.</p>
      ) : (
        <ul aria-label="Tus listas" className="-mx-3 space-y-1">
          {result.lists.map((list) => (
            <li key={list.id}>
              <button
                type="button"
                aria-pressed={list.containsGame}
                disabled={pendingListId === list.id}
                onClick={() => toggle(list.id, list.containsGame)}
                className="flex min-h-12 w-full items-center gap-3 rounded-card px-3 py-2 text-left transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:opacity-60"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-chip border ${
                    list.containsGame
                      ? "border-accent-ink bg-accent/15 text-accent-ink"
                      : "border-border-strong text-transparent"
                  }`}
                >
                  <Icon name="check" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate type-subtitle text-ink">{list.title}</span>
                  <span className="block type-caption text-ink-faint">
                    {list.itemCount === 1 ? "1 juego" : `${list.itemCount} juegos`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormError>{error}</FormError>
      <Link
        href={`/listas/nueva?juego=${gameId}`}
        onClick={onDone}
        className="flex min-h-11 items-center gap-2 type-meta font-medium text-accent-ink hover:underline"
      >
        <Icon name="plus" className="h-4 w-4" />
        Nueva lista con este juego
      </Link>
    </div>
  );
}
