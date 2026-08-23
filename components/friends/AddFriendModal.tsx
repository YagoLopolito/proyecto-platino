"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input, Label } from "@/components/Input";
import { FormError, FormSuccess } from "@/components/FormError";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { profileLabel } from "@/lib/friends/constants";
import {
  addFriend,
  removeFriend,
  searchUsers,
  type FriendActionState,
  type UserSearchResult,
} from "@/lib/friends/actions";

const initialState: FriendActionState = { error: null, success: null };
const DEBOUNCE_MS = 300;

/**
 * "Agregar amigo": lista todos los usuarios de la app (sin escribir nada) y
 * filtra por nombre de PSN o de la app a medida que se tipea. Agregar es
 * unidireccional y sin aceptación, ver la migración 20260822010000.
 */
export default function AddFriendModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();

  const [addState, addAction, addPending] = useActionState(addFriend, initialState);
  const [removeState, removeAction, removePending] = useActionState(removeFriend, initialState);

  // Pedido a la Server Action (efecto externo), no sincronización de estado:
  // corre al abrir el modal, con debounce en cada cambio del query, y de nuevo
  // cuando se agrega/saca a alguien para refrescar los botones de la lista.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const outcome = await searchUsers(query);
        if (cancelled) return;
        if (outcome.status === "error") {
          setSearchError(outcome.message);
          setResults([]);
        } else {
          setSearchError(null);
          setResults(outcome.results);
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, addState, removeState]);

  // El feed de amigos lo renderiza el server: después de agregar o sacar a
  // alguien hay que pedirle los datos de nuevo.
  useEffect(() => {
    if (addState.success || removeState.success) {
      router.refresh();
    }
  }, [addState, removeState, router]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-full py-2 sm:w-auto sm:py-1.5"
      >
        + Agregar amigo
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Agregar amigo"
        description="Todos los usuarios de Platinoob. Agregá a alguien para ver sus partidas terminadas y sus reseñas en tu diario."
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="friend-query" className="text-xs">
              Buscar usuario
            </Label>
            <Input
              id="friend-query"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre de PSN..."
              className="text-sm"
            />
            <p className="text-xs text-zinc-500" aria-live="polite">
              {isSearching ? "Buscando..." : " "}
            </p>
          </div>

          {searchError && <FormError>{searchError}</FormError>}

          {!isSearching && !searchError && results.length === 0 && (
            <p className="text-sm text-zinc-500">
              {query.trim() ? "Ningún usuario coincide." : "Todavía no hay otros usuarios."}
            </p>
          )}

          {results.length > 0 && (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {results.map((profile) => {
                const label = profileLabel(profile);
                return (
                  <li
                    key={profile.id}
                    className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900 p-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FriendAvatar url={profile.avatarUrl} name={label} />
                      <span className="min-w-0 truncate text-sm text-zinc-200">{label}</span>
                    </div>

                    <form action={profile.isFriend ? removeAction : addAction}>
                      <input type="hidden" name="friendId" value={profile.id} />
                      <Button
                        type="submit"
                        variant={profile.isFriend ? "secondary" : "primary"}
                        disabled={addPending || removePending}
                        className="shrink-0 text-xs"
                      >
                        {profile.isFriend ? "Quitar" : "Agregar"}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}

          <FormError>{addState.error ?? removeState.error}</FormError>
          <FormSuccess>{addState.success ?? removeState.success}</FormSuccess>
        </div>
      </Modal>
    </>
  );
}
