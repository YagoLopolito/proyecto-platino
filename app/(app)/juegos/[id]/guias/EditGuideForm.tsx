"use client";

import { useActionState, useState } from "react";
import { updateGuide, type GuideActionState } from "./actions";
import { Input, Textarea, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";

const initialState: GuideActionState = { error: null, success: null };

export default function EditGuideForm({
  gameId,
  guide,
}: {
  gameId: string;
  guide: {
    id: string;
    title: string;
    content_markdown: string | null;
    external_url: string | null;
    source: string | null;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateGuide, initialState);

  // Cerrar el form al confirmarse un submit exitoso, ajustando el estado
  // durante el render (patrón oficial de React) en vez de con un effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold">{guide.title}</h2>
            {guide.source && <p className="text-xs text-zinc-500">Fuente: {guide.source}</p>}
            {guide.external_url && (
              <a
                href={guide.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline"
              >
                {guide.external_url}
              </a>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={() => setEditing(true)} className="shrink-0 text-xs">
            Editar
          </Button>
        </div>
        {guide.content_markdown && (
          <pre className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
            {guide.content_markdown}
          </pre>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-3 rounded border border-zinc-700 bg-zinc-950 p-3">
      <input type="hidden" name="guideId" value={guide.id} />
      <input type="hidden" name="gameId" value={gameId} />

      <div className="space-y-1">
        <Label htmlFor={`edit-title-${guide.id}`} className="text-xs">
          Título
        </Label>
        <Input
          id={`edit-title-${guide.id}`}
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={guide.title}
          className="text-sm"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`edit-content-${guide.id}`} className="text-xs">
          Contenido en markdown
        </Label>
        <Textarea
          id={`edit-content-${guide.id}`}
          name="contentMarkdown"
          rows={5}
          defaultValue={guide.content_markdown ?? ""}
          className="font-mono text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`edit-url-${guide.id}`} className="text-xs">
            Link externo
          </Label>
          <Input
            id={`edit-url-${guide.id}`}
            name="externalUrl"
            type="url"
            maxLength={500}
            defaultValue={guide.external_url ?? ""}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`edit-source-${guide.id}`} className="text-xs">
            Fuente
          </Label>
          <Input
            id={`edit-source-${guide.id}`}
            name="source"
            type="text"
            maxLength={100}
            defaultValue={guide.source ?? ""}
            className="text-sm"
          />
        </div>
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
