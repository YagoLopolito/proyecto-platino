"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import type { ConnectionActionState } from "@/app/(app)/configuracion/conexiones/actions";

const initialState: ConnectionActionState = { error: null, success: null };

/**
 * Desconectar no borra los juegos ni los trofeos ya sincronizados: son del
 * usuario y el diario cuelga de ellos. La confirmación va porque volver a
 * conectar exige pegar de nuevo el NPSSO / el SteamID.
 */
export default function DisconnectButton({
  action,
  label,
  confirmMessage,
}: {
  action: (state: ConnectionActionState) => Promise<ConnectionActionState>;
  label: string;
  confirmMessage: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="space-y-2"
    >
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Desconectando..." : label}
      </Button>
      <FormError>{state.error}</FormError>
    </form>
  );
}
