"use client";

import { useActionState, useEffect, useRef } from "react";
import { createGuide, type GuideActionState } from "./actions";
import { Input, Textarea, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";

const initialState: GuideActionState = { error: null, success: null };

export default function AddGuideForm({ gameId }: { gameId: string }) {
  const [state, formAction, pending] = useActionState(createGuide, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <h3 className="text-sm font-semibold text-zinc-200">Nueva guía</h3>

      <div className="space-y-1">
        <Label htmlFor="title" className="text-xs">
          Título
        </Label>
        <Input id="title" name="title" type="text" required maxLength={200} className="text-sm" />
      </div>

      <div className="space-y-1">
        <Label htmlFor="contentMarkdown" className="text-xs">
          Contenido en markdown (opcional si pegás un link externo)
        </Label>
        <Textarea id="contentMarkdown" name="contentMarkdown" rows={5} className="font-mono text-sm" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="externalUrl" className="text-xs">
            Link externo (opcional)
          </Label>
          <Input
            id="externalUrl"
            name="externalUrl"
            type="url"
            maxLength={500}
            placeholder="https://..."
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="source" className="text-xs">
            Fuente (opcional)
          </Label>
          <Input
            id="source"
            name="source"
            type="text"
            maxLength={100}
            placeholder="PowerPyx, PSNProfiles..."
            className="text-sm"
          />
        </div>
      </div>

      <FormError>{state.error}</FormError>
      <FormSuccess>{state.success}</FormSuccess>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creando..." : "Crear guía"}
      </Button>
    </form>
  );
}
