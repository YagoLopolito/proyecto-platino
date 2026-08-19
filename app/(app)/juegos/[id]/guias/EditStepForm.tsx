"use client";

import { useActionState, useState } from "react";
import { updateStep, type GuideActionState } from "./actions";
import { Input, Select } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";

const initialState: GuideActionState = { error: null, success: null };

export default function EditStepForm({
  gameId,
  guideId,
  step,
  trophies,
}: {
  gameId: string;
  guideId: string;
  step: { id: string; content: string; trophy_id: string | null };
  trophies: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateStep, initialState);

  // Cerrar el form al confirmarse un submit exitoso, ajustando el estado
  // durante el render (patrón oficial de React) en vez de con un effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setEditing(false);
  }

  if (!editing) {
    return (
      <Button type="button" variant="ghost" onClick={() => setEditing(true)} className="shrink-0 p-0 text-xs">
        Editar
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex w-full flex-wrap items-start gap-2 rounded border border-zinc-700 bg-zinc-950 p-2"
    >
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="guideId" value={guideId} />
      <input type="hidden" name="gameId" value={gameId} />

      <Input
        name="content"
        type="text"
        required
        maxLength={500}
        defaultValue={step.content}
        className="min-w-[12rem] flex-1 py-1.5 text-sm"
      />

      {trophies.length > 0 && (
        <Select name="trophyId" defaultValue={step.trophy_id ?? ""} className="py-1.5 text-sm">
          <option value="">Sin trofeo asociado</option>
          {trophies.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      )}

      <Button type="submit" disabled={pending} className="shrink-0">
        {pending ? "..." : "Guardar"}
      </Button>
      <Button type="button" variant="secondary" onClick={() => setEditing(false)} className="shrink-0">
        Cancelar
      </Button>

      <FormError className="w-full text-xs">{state.error}</FormError>
    </form>
  );
}
