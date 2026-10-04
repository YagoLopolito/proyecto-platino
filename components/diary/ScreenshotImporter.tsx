"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_FILES_PER_IMPORT,
  MAX_FILES_PER_POST,
  MAX_IMAGE_BYTES,
} from "@/lib/posts/constants";
import { publishFiles } from "@/lib/posts/publish-files";
import { groupFilesByGame, type MatchableGame } from "@/lib/diary/screenshot-import";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";
import { GameArt } from "@/components/game/GameArt";
import { Select } from "@/components/ui/Select";

interface ImporterGame extends MatchableGame {
  coverUrl: string | null;
}

interface PickedFile {
  file: File;
  relativePath: string;
}

const MAX_MB = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
const MAX_SCREENSHOTS_PER_IMPORT = MAX_FILES_PER_IMPORT;
const SCREENSHOT_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

function isAcceptedScreenshotType(type: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Importador masivo de capturas: el usuario suelta la carpeta que exportó de
 * la consola y cada archivo se asigna al juego que dice su ruta
 * (`lib/diary/screenshot-import.ts` hace la deducción, este componente sólo
 * muestra el resultado y deja corregirlo).
 *
 * Cada juego se publica en la Galería online con `publishFiles`, el mismo
 * flujo que el compositor: los archivos van directo del browser a Storage (un
 * Server Action tiene límite de body y una captura pesa varios MB) y una
 * Server Action revalida y publica.
 */
export default function ScreenshotImporter({ games }: { games: ImporterGame[] }) {
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const uploading = uploaded !== null;

  const groups = useMemo(
    () =>
      groupFilesByGame(
        picked.map((item) => ({ name: item.file.name, relativePath: item.relativePath })),
        games,
      ),
    [picked, games],
  );

  function addFiles(incoming: PickedFile[]) {
    setSuccess(null);

    const rejected: string[] = [];
    const accepted: PickedFile[] = [];
    for (const item of incoming) {
      if (!isAcceptedScreenshotType(item.file.type)) {
        // Una carpeta exportada de la consola trae también clips de video y
        // archivos de sistema: se saltean sin nombrarlos uno por uno.
        continue;
      }
      if (item.file.size > MAX_IMAGE_BYTES) {
        rejected.push(`${item.file.name} (pesa más de ${MAX_MB} MB)`);
      } else {
        accepted.push(item);
      }
    }

    const room = MAX_SCREENSHOTS_PER_IMPORT - picked.length;
    if (accepted.length > room) {
      accepted.length = Math.max(0, room);
      rejected.push(`solo entran ${MAX_SCREENSHOTS_PER_IMPORT} capturas por vez`);
    }

    if (accepted.length === 0 && rejected.length === 0) {
      setError("No se encontró ninguna imagen en lo que soltaste.");
      return;
    }

    setPicked((current) => [...current, ...accepted]);
    setError(rejected.length > 0 ? `No se agregaron: ${rejected.join(", ")}.` : null);
  }

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Se limpia siempre: si no, elegir la misma carpeta dos veces seguidas no
    // vuelve a disparar el change.
    event.target.value = "";
    addFiles(
      files.map((file) => ({
        file,
        // `webkitRelativePath` sólo viene con `webkitdirectory`; con archivos
        // sueltos queda vacío y la deducción cae al nombre del archivo.
        relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "",
      })),
    );
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (uploading) return;
    addFiles(await readDroppedItems(event.dataTransfer));
  }

  function resolvedGameId(group: (typeof groups)[number]): string {
    const key = groupKey(group);
    return overrides[key] ?? group.game?.id ?? "";
  }

  async function importAll() {
    if (picked.length === 0 || uploading) return;

    const assignments: { file: File; gameId: string }[] = [];
    for (const group of groups) {
      const gameId = resolvedGameId(group);
      if (!gameId) continue;
      for (const index of group.fileIndexes) {
        assignments.push({ file: picked[index].file, gameId });
      }
    }

    if (assignments.length === 0) {
      setError("Ninguna captura tiene un juego asignado. Elegí uno en cada grupo.");
      return;
    }

    setError(null);
    setSuccess(null);
    setUploaded(0);

    // Cada juego se publica en la Galería online en tandas de hasta
    // MAX_FILES_PER_POST capturas (un carrusel por tanda), con el mismo flujo
    // que el compositor: borrador, subida directa a Storage y confirmación
    // validada en el servidor.
    const byGame = new Map<string, File[]>();
    for (const assignment of assignments) {
      byGame.set(assignment.gameId, [...(byGame.get(assignment.gameId) ?? []), assignment.file]);
    }

    let posts = 0;
    let published = 0;
    const failed: string[] = [];
    for (const [gameId, files] of byGame) {
      for (let i = 0; i < files.length; i += MAX_FILES_PER_POST) {
        const batch = files.slice(i, i + MAX_FILES_PER_POST);
        const result = await publishFiles({
          gameId,
          files: batch,
          onFileDone: () => setUploaded((done) => (done ?? 0) + 1),
        });
        failed.push(...result.skipped);
        if (result.status === "ok") {
          posts += 1;
          published += batch.length - result.skipped.length;
        } else {
          failed.push(result.message);
        }
      }
    }
    setUploaded(null);

    if (posts === 0) {
      setError(`No se pudo publicar: ${failed.join(" · ")}`);
      return;
    }

    setPicked([]);
    setOverrides({});
    setError(failed.length > 0 ? `Algunas no se pudieron subir: ${failed.join(" · ")}` : null);
    setSuccess(
      `${published === 1 ? "1 captura publicada" : `${published} capturas publicadas`} en ${
        posts === 1 ? "1 publicación" : `${posts} publicaciones`
      } de tu Galería online.`,
    );
    router.refresh();
  }

  const assignedCount = groups.reduce(
    (total, group) => total + (resolvedGameId(group) ? group.fileIndexes.length : 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`space-y-3 rounded-card border-2 border-dashed p-6 text-center transition-colors ${
          dragging ? "border-accent-ink bg-accent/10" : "border-border-strong bg-surface"
        }`}
      >
        <p className="type-body text-ink">
          Arrastrá acá la carpeta <code className="text-ink-muted">Screenshots</code> de tu USB, o
          elegila con los botones.
        </p>
        <p className="type-caption text-ink-faint">
          JPG, PNG, WebP o AVIF · hasta {MAX_MB} MB cada una · {MAX_SCREENSHOTS_PER_IMPORT} por vez.
          Los videos y archivos de otro tipo se ignoran solos.
        </p>

        <input
          ref={folderInputRef}
          type="file"
          multiple
          onChange={onFilesSelected}
          className="sr-only"
          aria-label="Elegir carpeta de capturas"
          // `webkitdirectory` no está en los tipos de React (no es estándar) y
          // es la única forma de que el picker devuelva una carpeta entera con
          // su `webkitRelativePath`, que es de donde sale el nombre del juego.
          {...{ webkitdirectory: "", directory: "" }}
        />
        <input
          ref={filesInputRef}
          type="file"
          accept={SCREENSHOT_ACCEPT}
          multiple
          onChange={onFilesSelected}
          className="sr-only"
          aria-label="Elegir capturas sueltas"
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading}
          >
            Elegir carpeta
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => filesInputRef.current?.click()}
            disabled={uploading}
          >
            Elegir capturas sueltas
          </Button>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="space-y-3" data-testid="screenshot-import-groups">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-body text-ink-muted">
              {picked.length} {picked.length === 1 ? "captura" : "capturas"} en {groups.length}{" "}
              {groups.length === 1 ? "grupo" : "grupos"} · {assignedCount} con juego asignado
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPicked([]);
                setOverrides({});
              }}
              disabled={uploading}
            >
              Vaciar
            </Button>
          </div>

          <ul className="space-y-2">
            {groups.map((group) => {
              const key = groupKey(group);
              const gameId = resolvedGameId(group);
              const game = games.find((candidate) => candidate.id === gameId) ?? null;
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3"
                >
                  <div className="h-14 w-11 shrink-0 overflow-hidden rounded-chip bg-surface-hover">
                    {game?.coverUrl && (
                      <GameArt
                        src={game.coverUrl}
                        alt={game.name}
                        width={44}
                        height={56}
                        className="h-full w-full object-cover"
                        fallback={null}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate type-subtitle text-ink">
                      {group.detectedName ?? "Sin juego detectado"}
                    </p>
                    <p className="type-meta text-ink-faint">
                      {group.fileIndexes.length}{" "}
                      {group.fileIndexes.length === 1 ? "captura" : "capturas"}
                      {group.game ? " · detectado automáticamente" : ""}
                    </p>
                  </div>
                  <label className="w-full sm:w-64">
                    <span className="sr-only">
                      Juego para {group.detectedName ?? "las capturas sin juego"}
                    </span>
                    <Select
                      value={gameId}
                      disabled={uploading}
                      onChange={(event) =>
                        setOverrides((current) => ({ ...current, [key]: event.target.value }))
                      }
                    >
                      <option value="">— No importar —</option>
                      {games.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                </li>
              );
            })}
          </ul>

          <Button type="button" onClick={importAll} disabled={uploading} className="w-full">
            {uploading
              ? `Subiendo ${uploaded} de ${assignedCount}...`
              : `Importar ${assignedCount} ${assignedCount === 1 ? "captura" : "capturas"}`}
          </Button>
        </div>
      )}

      {games.length === 0 && (
        <p className="type-body text-ink-muted">
          Todavía no tenés juegos en la biblioteca: sincronizá PSN o Steam antes de importar
          capturas.
        </p>
      )}

      <FormError>{error}</FormError>
      <FormSuccess>{success}</FormSuccess>
    </div>
  );
}

/**
 * Clave estable de un grupo, para poder guardar la corrección manual del
 * usuario aunque después agregue más archivos y se recalculen los grupos.
 */
function groupKey(group: { game: { id: string } | null; detectedName: string | null }): string {
  return group.game ? `game:${group.game.id}` : `name:${group.detectedName ?? ""}`;
}

/**
 * Archivos de un drop. Cuando el navegador lo soporta (Chrome, Edge, Safari) se
 * recorre el árbol con `webkitGetAsEntry` para poder soltar una carpeta entera
 * y conservar la ruta relativa, que es de donde sale el nombre del juego; si no
 * está disponible se cae a los `files` planos del `DataTransfer`.
 */
async function readDroppedItems(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    return Array.from(dataTransfer.files).map((file) => ({ file, relativePath: "" }));
  }

  const out: PickedFile[] = [];
  for (const entry of entries) {
    await collectEntry(entry, "", out);
  }
  return out;
}

async function collectEntry(entry: FileSystemEntry, prefix: string, out: PickedFile[]) {
  if (out.length >= MAX_SCREENSHOTS_PER_IMPORT) return;

  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => {
      (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
    });
    if (file) out.push({ file, relativePath: `${prefix}${entry.name}` });
    return;
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // `readEntries` devuelve de a tandas (100 en Chrome): hay que llamarlo hasta
  // que conteste vacío o una carpeta grande se lee a medias.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });
    if (batch.length === 0) break;
    for (const child of batch) {
      await collectEntry(child, `${prefix}${entry.name}/`, out);
    }
  }
}
