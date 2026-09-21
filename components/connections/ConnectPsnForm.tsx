"use client";

import { useActionState } from "react";
import {
  connectPsnAccount,
  type ConnectionActionState,
} from "@/app/(app)/configuracion/conexiones/actions";
import { Textarea, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";
import { Disclosure } from "@/components/ui/Disclosure";

const initialState: ConnectionActionState = { error: null, success: null };

const linkClassName = "font-medium text-accent-ink hover:underline";

export default function ConnectPsnForm({ isReconnect = false }: { isReconnect?: boolean }) {
  const [state, formAction, pending] = useActionState(connectPsnAccount, initialState);

  return (
    <form id="reconectar-psn" action={formAction} className="space-y-4">
      {/*
       * Las instrucciones van plegadas (issue #176 §4): se leen una vez, y
       * después compiten con el campo. Lo que queda siempre a la vista es la
       * acción -- el campo y el botón -- no el manual.
       */}
      <Disclosure summary="Cómo conseguir el NPSSO">
        <ol className="list-inside list-decimal space-y-1 type-meta text-ink-muted">
          <li>
            Iniciá sesión en{" "}
            <a
              href="https://www.playstation.com"
              target="_blank"
              rel="noreferrer"
              className={linkClassName}
            >
              playstation.com
            </a>
            .
          </li>
          <li>
            En el mismo navegador, entrá a{" "}
            <a
              href="https://ca.account.sony.com/api/v1/ssocookie"
              target="_blank"
              rel="noreferrer"
              className={linkClassName}
            >
              ca.account.sony.com/api/v1/ssocookie
            </a>
            .
          </li>
          <li>Copiá el valor de &quot;npsso&quot; del JSON que aparece.</li>
        </ol>
      </Disclosure>

      <div className="space-y-1">
        <Label htmlFor="npsso">NPSSO</Label>
        <Textarea
          id="npsso"
          name="npsso"
          required
          rows={3}
          placeholder="Pegá acá tu NPSSO"
          className="font-mono type-meta"
        />
      </div>

      <FormError>{state.error}</FormError>
      <FormSuccess>{state.success}</FormSuccess>

      <Button type="submit" disabled={pending}>
        {pending ? "Conectando..." : isReconnect ? "Reconectar" : "Conectar cuenta PSN"}
      </Button>
    </form>
  );
}
