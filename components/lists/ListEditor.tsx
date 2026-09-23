"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CatalogSearchCombobox, { type PickedGame } from "@/components/diary/CatalogSearchCombobox";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import { Input, Label, Textarea } from "@/components/Input";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { saveList } from "@/lib/lists/actions";
import {
  MAX_LIST_DESCRIPTION,
  MAX_LIST_ITEMS,
  MAX_LIST_NOTE,
  MAX_LIST_TITLE,
  type ListVisibility,
} from "@/lib/lists/constants";

export interface EditorItem {
  gameId: string;
  name: string;
  imageUrl: string | null;
  note: string;
}

export interface ListEditorInitial {
  id?: string;
  title: string;
  description: string;
  isRanked: boolean;
  visibility: ListVisibility;
  items: EditorItem[];
}

const iconButtonClass =
  "flex h-11 w-11 items-center justify-center rounded-chip text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:opacity-30 disabled:hover:bg-transparent sm:h-9 sm:w-9";

/**
 * Crear o editar una lista (epic #183, issue #189). Todo el estado vive acá
 * hasta "Guardar": la Server Action reescribe los items enteros, así que no
 * hay por qué ir guardando de a un cambio.
 *
 * El orden se cambia con botones ↑/↓ con nombre accesible ("Subir X"): es el
 * camino que funciona con teclado, lector de pantalla y dedo. Drag & drop
 * podría sumarse encima, nunca en lugar de esto.
 */
export function ListEditor({ initial }: { initial: ListEditorInitial }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [isRanked, setIsRanked] = useState(initial.isRanked);
  const [visibility, setVisibility] = useState<ListVisibility>(initial.visibility);
  const [items, setItems] = useState<EditorItem[]>(initial.items);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addGame(gameId: string, game: PickedGame) {
    setError(null);
    if (items.some((item) => item.gameId === gameId)) {
      setNotice(`${game.name || "Ese juego"} ya está en la lista.`);
      return;
    }
    if (items.length >= MAX_LIST_ITEMS) {
      setError(`Una lista puede tener hasta ${MAX_LIST_ITEMS} juegos.`);
      return;
    }
    setItems((current) => [
      ...current,
      { gameId, name: game.name, imageUrl: game.coverUrl, note: "" },
    ]);
    setNotice(`Agregado: ${game.name}.`);
  }

  function move(index: number, delta: -1 | 1) {
    setItems((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function setNote(index: number, note: string) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, note } : item)));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveList({
        id: initial.id,
        title,
        description,
        isRanked,
        visibility,
        items: items.map((item) => ({ gameId: item.gameId, note: item.note })),
      });
      if (result.error || !result.listId) {
        setError(result.error ?? "No se pudo guardar la lista.");
        return;
      }
      router.push(`/listas/${result.listId}`);
    });
  }

  // Dos bloques hermanos y no uno adentro del otro: el buscador de catálogo
  // tiene sus propios `<form>` (el alta de un juego de RAWG), y un form
  // anidado no es HTML válido -- el navegador lo ignora y el "Agregar" del
  // catálogo terminaba mandando la lista entera.
  return (
    <div className="space-y-8">
      <form id="list-editor" onSubmit={submit} className="space-y-8">
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="list-title">Título</Label>
            <Input
              id="list-title"
              value={title}
              maxLength={MAX_LIST_TITLE}
              required
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Mis platinos favoritos"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="list-description">Descripción (opcional)</Label>
            <Textarea
              id="list-description"
              value={description}
              maxLength={MAX_LIST_DESCRIPTION}
              rows={4}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <ToggleChip checked={isRanked} onChange={setIsRanked}>
              Lista numerada
            </ToggleChip>
            <label className="flex items-center gap-2 type-caption text-ink-muted">
              <span>Visibilidad</span>
              <Select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as ListVisibility)}
              >
                <option value="public">Pública</option>
                <option value="private">Privada (sólo vos)</option>
              </Select>
            </label>
          </div>
        </div>

        <section className="space-y-3" aria-labelledby="list-games-heading">
          <h2 id="list-games-heading" className="type-overline text-ink-faint">
            Juegos · {items.length}
          </h2>
          {items.length === 0 ? (
            <p className="type-body text-ink-muted">Todavía no agregaste ningún juego.</p>
          ) : (
            <ol aria-label="Juegos de la lista" className="divide-y divide-border">
              {items.map((item, index) => (
                <li key={item.gameId} className="flex gap-3 py-3">
                  <span className="w-6 shrink-0 pt-1 text-right type-meta tabular-nums text-ink-faint">
                    {index + 1}
                  </span>
                  <span className="relative block aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-chip border border-border bg-surface">
                    {item.imageUrl && (
                      <GameArt
                        src={item.imageUrl}
                        alt=""
                        sizes="48px"
                        className="object-cover"
                        fallback={null}
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="truncate type-subtitle text-ink">{item.name}</p>
                    <Input
                      aria-label={`Nota para ${item.name}`}
                      value={item.note}
                      maxLength={MAX_LIST_NOTE}
                      placeholder="Nota (opcional)"
                      onChange={(event) => setNote(index, event.target.value)}
                    />
                  </div>
                  <div className="flex shrink-0 flex-col sm:flex-row sm:items-start">
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={`Subir ${item.name}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <Icon name="arrow-down" className="h-4 w-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={`Bajar ${item.name}`}
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <Icon name="arrow-down" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={`Quitar ${item.name}`}
                      onClick={() => remove(index)}
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </form>

      <section
        className="space-y-2 rounded-card border border-border bg-surface p-3"
        aria-label="Agregar juegos"
      >
        <p className="type-meta text-ink-muted">Agregar juegos</p>
        <CatalogSearchCombobox
          inputId="list-add-game"
          selectLabel="Agregar"
          onSelectGame={addGame}
        />
        {notice && (
          <p role="status" className="type-caption text-ink-muted">
            {notice}
          </p>
        )}
      </section>

      <FormError>{error}</FormError>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" form="list-editor" disabled={pending}>
          {pending ? "Guardando..." : "Guardar lista"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
