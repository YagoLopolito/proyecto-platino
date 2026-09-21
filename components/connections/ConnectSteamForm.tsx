"use client";

import { useActionState } from "react";
import {
  connectSteamAccount,
  type ConnectionActionState,
} from "@/app/(app)/configuracion/conexiones/actions";
import { Input, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";
import { Disclosure } from "@/components/ui/Disclosure";

const initialState: ConnectionActionState = { error: null, success: null };

export default function ConnectSteamForm({ isReconnect = false }: { isReconnect?: boolean }) {
  const [state, formAction, pending] = useActionState(connectSteamAccount, initialState);

  return (
    <form id="conectar-steam" action={formAction} className="space-y-4">
      {/* Plegado por la misma razón que el de PSN: el campo es la acción, el
          "dónde lo encuentro" se lee una vez. */}
      <Disclosure summary="Dónde encuentro mi SteamID">
        <p className="type-meta text-ink-muted">
          No hace falta ninguna contraseña ni token: alcanza con tu SteamID64 o la URL de tu perfil
          (<span className="font-mono">steamcommunity.com/id/tunombre</span>). Lo encontrás en Steam
          → Perfil → Editar perfil.
        </p>
      </Disclosure>

      <div className="space-y-1">
        <Label htmlFor="steamId">SteamID64 o URL del perfil</Label>
        <Input
          id="steamId"
          name="steamId"
          required
          placeholder="76561198000000000 o steamcommunity.com/id/tunombre"
          className="font-mono type-meta"
        />
      </div>

      <FormError>{state.error}</FormError>
      <FormSuccess>{state.success}</FormSuccess>

      <Button type="submit" disabled={pending}>
        {pending ? "Conectando..." : isReconnect ? "Cambiar cuenta" : "Conectar cuenta de Steam"}
      </Button>
    </form>
  );
}
