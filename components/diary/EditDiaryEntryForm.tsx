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
    source?: string;
    platinum_earned_at?: string | null;
    completed_at?: string | null;
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
      <div className="flex flex-col gap-3 rounded border border-zinc-800 bg-zinc-950 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-200">
            <span>
              Partida #{entry.playthrough_number} · {entry.finished_on}
            </span>
            <StarRatingDisplay rating={entry.rating} />
            {entry.platinum_earned_at && (
              <span className="rounded-full border border-zinc-600/60 bg-zinc-700/20 px-1.5 py-0.5 text-[11px] text-zinc-300">
                🏆 Platinado
              </span>
            )}
            {entry.completed_at && (
              <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300">
                100% completado
              </span>
            )}
          </p>
          {entry.review && (
            <p className="whitespace-pre-line break-words text-xs text-zinc-500">{entry.review}</p>
          )}
          {(entry.source === "platinum_sync" || entry.source === "completion_sync") &&
            entry.rating === null && (
              <p className="text-xs text-zinc-500">
                Creada automáticamente al detectar el platino en PSN. Editala para puntuarla y
                reseñarla.
              </p>
            )}
        </div>
        {/* En mobile las acciones bajan a su propia fila y ocupan la mitad
            del ancho cada una, para tener área táctil real. */}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setEditing(true)}
            className="flex-1 py-2 text-xs sm:flex-none sm:py-1.5"
          >
            Editar
          </Button>
          <form action={deleteDiaryEntry} className="flex-1 sm:flex-none">
            <input type="hidden" name="entryId" value={entry.id} />
            <input type="hidden" name="gameId" value={gameId} />
            <button
              type="submit"
              className="w-full rounded border border-zinc-700 px-2 py-2 text-xs text-zinc-400 hover:border-red-500 hover:text-red-400 sm:py-1.5"
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
          <Label htmlFor={`edit-date-${entry.id}`}>Fecha</Label>
          <Input
            id={`edit-date-${entry.id}`}
            name="finishedOn"
            type="date"
            required
            defaultValue={entry.finished_on}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`edit-rating-${entry.id}`}>Rating</Label>
          <StarRatingInput id={`edit-rating-${entry.id}`} defaultValue={entry.rating} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`edit-review-${entry.id}`}>Reseña</Label>
        <Textarea
          id={`edit-review-${entry.id}`}
          name="review"
          rows={3}
          maxLength={2000}
          defaultValue={entry.review ?? ""}
        />
      </div>

      <FormError>{state.error}</FormError>

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="flex-1 py-2 text-xs sm:flex-none sm:py-1.5"
        >
          {pending ? "Guardando..." : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditing(false)}
          className="flex-1 py-2 text-xs sm:flex-none sm:py-1.5"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
