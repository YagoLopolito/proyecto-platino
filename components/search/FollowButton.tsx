"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { addFriend, removeFriend, type FriendActionState } from "@/lib/friends/actions";

const noState: FriendActionState = { error: null, success: null };

type FollowState = { following: boolean; error: string | null };

/**
 * "Seguir" en una fila de Buscar › Usuarios (issue #194). Sin estado
 * optimista: lo que se ve es lo que devolvió el server, como el toggle de
 * "Jugando". Si la action falla, queda como estaba y se muestra el error.
 */
export function FollowButton({
  userId,
  name,
  isFriend,
}: {
  userId: string;
  name: string;
  isFriend: boolean;
}) {
  const [state, action, pending] = useActionState(
    async (previous: FollowState, formData: FormData): Promise<FollowState> => {
      const follow = !previous.following;
      const result = follow
        ? await addFriend(noState, formData)
        : await removeFriend(noState, formData);
      return result.error
        ? { following: previous.following, error: result.error }
        : { following: follow, error: null };
    },
    { following: isFriend, error: null },
  );

  return (
    <form action={action} className="shrink-0 text-right">
      <input type="hidden" name="friendId" value={userId} />
      <Button
        type="submit"
        variant={state.following ? "secondary" : "primary"}
        disabled={pending}
        aria-pressed={state.following}
        aria-label={`Seguir a ${name}`}
      >
        {state.following ? "Siguiendo" : "Seguir"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-1 type-caption text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
