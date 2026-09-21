"use client";

import { useActionState, useEffect, useRef } from "react";
import { createDiaryEntry, type DiaryActionState } from "@/app/(app)/juegos/[id]/diario/actions";
import { Input, Textarea, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";
import { StarRatingInput } from "@/components/diary/StarRating";

const initialState: DiaryActionState = { error: null, success: null };

function todayLocalDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default function AddDiaryEntryForm({ gameId }: { gameId: string }) {
  const [state, formAction, pending] = useActionState(createDiaryEntry, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-card border border-border bg-surface p-4"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <h3 className="type-subtitle text-ink">Marcar como terminado</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="finishedOn">Fecha</Label>
          <Input
            id="finishedOn"
            name="finishedOn"
            type="date"
            required
            defaultValue={todayLocalDate()}
            max={todayLocalDate()}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rating">Rating (opcional)</Label>
          <StarRatingInput key={state.success ?? ""} id="rating" />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="review">Reseña (opcional)</Label>
        <Textarea id="review" name="review" rows={3} maxLength={2000} />
      </div>

      <FormError>{state.error}</FormError>
      <FormSuccess>{state.success}</FormSuccess>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Guardando..." : "Guardar en el diario"}
      </Button>
    </form>
  );
}
