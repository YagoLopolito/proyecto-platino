"use client";

import { useActionState, useState } from "react";
import {
  updateDiaryEntry,
  deleteDiaryEntry,
  type DiaryActionState,
} from "@/app/(app)/juegos/[id]/diario/actions";
import { Input, Textarea, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import { StarRatingInput, StarRatingDisplay } from "@/components/diary/StarRating";

const initialState: DiaryActionState = { error: null, success: null };

export default function EditDiaryEntryForm({
  gameId,
  entry,
}: {
  gameId: string;
  entry: {
    id: string;
    playthrough_number: number;
    rating: number | null;
    review: string | null;
    finished_on: string;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateDiaryEntry, initialState);

  // Cerrar el form al confirmarse un submit exitoso, ajustando el estado
  // durante el render (mismo patrón que EditGuideForm) en vez de con un effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-4 rounded border border-zinc-800 bg-zinc-950 p-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-sm text-zinc-200">
            <span>
              Partida #{entry.playthrough_number} · {entry.finished_on}
            </span>
            <StarRatingDisplay rating={entry.rating} />
          </p>
          {entry.review && <p className="text-xs text-zinc-500">{entry.review}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setEditing(true)} className="text-xs">
            Editar
          </Button>
          <form action={deleteDiaryEntry}>
            <input type="hidden" name="entryId" value={entry.id} />
            <input type="hidden" name="gameId" value={gameId} />
            <button
              type="submit"
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-red-500 hover:text-red-400"
            >
              Borrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded border border-zinc-700 bg-zinc-950 p-3">
      <input type="hidden" name="entryId" value={entry.id} />
      <input type="hidden" name="gameId" value={gameId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`edit-date-${entry.id}`} className="text-xs">
            Fecha
          </Label>
          <Input
            id={`edit-date-${entry.id}`}
            name="finishedOn"
            type="date"
            required
            defaultValue={entry.finished_on}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`edit-rating-${entry.id}`} className="text-xs">
            Rating
          </Label>
          <StarRatingInput id={`edit-rating-${entry.id}`} defaultValue={entry.rating} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`edit-review-${entry.id}`} className="text-xs">
          Reseña
        </Label>
        <Textarea
          id={`edit-review-${entry.id}`}
          name="review"
          rows={3}
          maxLength={2000}
          defaultValue={entry.review ?? ""}
          className="text-sm"
        />
      </div>

      <FormError>{state.error}</FormError>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="text-xs">
          {pending ? "Guardando..." : "Guardar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)} className="text-xs">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
