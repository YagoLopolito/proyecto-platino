"use client";

import { useActionState, useState } from "react";
import { updateGuide, type GuideActionState } from "./actions";

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
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-blue-500 hover:text-blue-400"
          >
            Editar
          </button>
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
        <label htmlFor={`edit-title-${guide.id}`} className="text-xs text-zinc-400">
          Título
        </label>
        <input
          id={`edit-title-${guide.id}`}
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={guide.title}
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor={`edit-content-${guide.id}`} className="text-xs text-zinc-400">
          Contenido en markdown
        </label>
        <textarea
          id={`edit-content-${guide.id}`}
          name="contentMarkdown"
          rows={5}
          defaultValue={guide.content_markdown ?? ""}
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-50"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`edit-url-${guide.id}`} className="text-xs text-zinc-400">
            Link externo
          </label>
          <input
            id={`edit-url-${guide.id}`}
            name="externalUrl"
            type="url"
            maxLength={500}
            defaultValue={guide.external_url ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`edit-source-${guide.id}`} className="text-xs text-zinc-400">
            Fuente
          </label>
          <input
            id={`edit-source-${guide.id}`}
            name="source"
            type="text"
            maxLength={100}
            defaultValue={guide.source ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
