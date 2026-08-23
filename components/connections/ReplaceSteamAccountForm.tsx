"use client";

import { useActionState } from "react";
import {
  replaceSteamAccount,
  type ConnectionActionState,
} from "@/app/(app)/configuracion/conexiones/actions";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";

const initialState: ConnectionActionState = { error: null, success: null };

/**
 * El usuario se logueó en Steam con una cuenta distinta de la que tenía
 * conectada a mano. No se pisa en silencio: se le muestra cuál es y decide.
 */
export default function ReplaceSteamAccountForm({ verifiedSteamId }: { verifiedSteamId: string }) {
  const [state, formAction, pending] = useActionState(replaceSteamAccount, initialState);

  return (
    <form action={formAction} className="space-y-2 rounded border border-amber-600/60 bg-amber-500/10 p-3">
      <p className="text-sm text-amber-200">
        Te logueaste en Steam con la cuenta{" "}
        <span className="font-mono">{verifiedSteamId}</span>, que no es la que tenés conectada.
      </p>
      <input type="hidden" name="steamId" value={verifiedSteamId} />
      <FormError>{state.error}</FormError>
      <FormSuccess>{state.success}</FormSuccess>
      <Button type="submit" disabled={pending}>
        {pending ? "Reemplazando..." : "Usar la cuenta verificada"}
      </Button>
    </form>
  );
}
