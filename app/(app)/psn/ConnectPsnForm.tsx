"use client";

import { useActionState } from "react";
import { connectPsnAccount, type PsnActionState } from "./actions";
import { Textarea, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";

const initialState: PsnActionState = { error: null, success: null };

export default function ConnectPsnForm() {
  const [state, formAction, pending] = useActionState(connectPsnAccount, initialState);

  return (
    <form
      id="reconectar-psn"
      action={formAction}
      className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6"
    >
      <h2 className="text-lg font-semibold text-zinc-50">Conectar cuenta PSN</h2>

      <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-400">
        <li>
          Iniciá sesión en{" "}
          <a
            href="https://www.playstation.com"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline"
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
            className="text-blue-400 hover:underline"
          >
            ca.account.sony.com/api/v1/ssocookie
          </a>
          .
        </li>
        <li>Copiá el valor de &quot;npsso&quot; del JSON que aparece.</li>
      </ol>

      <div className="space-y-1">
        <Label htmlFor="npsso">NPSSO</Label>
        <Textarea
          id="npsso"
          name="npsso"
          required
          rows={3}
          placeholder="Pegá acá tu NPSSO"
          className="font-mono text-sm"
        />
      </div>

      <FormError>{state.error}</FormError>
      <FormSuccess>{state.success}</FormSuccess>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Conectando..." : "Conectar"}
      </Button>
    </form>
  );
}
