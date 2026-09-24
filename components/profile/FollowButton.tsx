"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import { Icon } from "@/components/ui/Icon";
import { addFriend, removeFriend, type FriendActionState } from "@/lib/friends/actions";

const initialState: FriendActionState = { error: null, success: null };

/**
 * Agregar / quitar a un usuario desde su perfil. La relación es unidireccional
 * y sin aceptación (ver la migración 20260822010000): agregar a alguien solo
 * decide qué aparece en tu feed, no le da acceso a nada.
 */
export function FollowButton({ userId, isFriend }: { userId: string; isFriend: boolean }) {
  const router = useRouter();
  const action = isFriend ? removeFriend : addFriend;
  const [state, formAction, pending] = useActionState(action, initialState);

  // El botón lo renderiza el server (sabe si ya es amigo): al confirmarse el
  // submit se le piden los datos de nuevo. Es un efecto externo (navegación),
  // no sincronización de estado, igual que en `AddFriendModal`.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="friendId" value={userId} />
      <Button
        type="submit"
        variant={isFriend ? "secondary" : "primary"}
        disabled={pending}
        aria-pressed={isFriend}
      >
        {/* "Seguir / Siguiendo" (#197): la relación es unidireccional y sin
            aceptación, es seguir y no una solicitud de amistad. */}
        {isFriend ? (
          <>
            <Icon name="check" className="h-4 w-4" />
            Siguiendo
          </>
        ) : (
          <>
            <Icon name="plus" className="h-4 w-4" />
            Seguir
          </>
        )}
      </Button>
      <FormError>{state.error}</FormError>
    </form>
  );
}
