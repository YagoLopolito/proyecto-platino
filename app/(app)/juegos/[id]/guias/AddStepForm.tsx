"use client";

import { useActionState, useEffect, useRef } from "react";
import { addStep, type GuideActionState } from "./actions";
import { Input, Select } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";

const initialState: GuideActionState = { error: null, success: null };

export default function AddStepForm({
  guideId,
  gameId,
  nextOrder,
  trophies,
}: {
  guideId: string;
  gameId: string;
  nextOrder: number;
  trophies: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(addStep, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-start gap-2 pt-2">
      <input type="hidden" name="guideId" value={guideId} />
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="stepOrder" value={nextOrder} />

      <Input
        name="content"
        type="text"
        required
        maxLength={500}
        placeholder="Descripción del paso"
        className="min-w-[12rem] flex-1 py-1.5 text-sm"
      />

      {trophies.length > 0 && (
        <Select name="trophyId" defaultValue="" className="py-1.5 text-sm">
          <option value="">Sin trofeo asociado</option>
          {trophies.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      )}

      <Button type="submit" variant="secondary" disabled={pending} className="shrink-0 bg-zinc-700 text-white hover:bg-zinc-600">
        {pending ? "..." : "Agregar paso"}
      </Button>

      <FormError className="w-full text-xs">{state.error}</FormError>
    </form>
  );
}
