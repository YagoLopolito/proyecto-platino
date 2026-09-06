/**
 * Importación masiva de capturas: deduce a qué juego pertenece cada archivo a
 * partir de su nombre o de la carpeta que lo contiene.
 *
 * Existe porque **Sony no expone la galería de capturas de PSN por ninguna API
 * usable** (ver la sección de capturas en `CLAUDE.md`): no hay forma de traer
 * las fotos automáticamente con el sync. Lo que sí se puede es aprovechar que
 * la consola, al exportar a un USB, guarda el nombre del juego en la ruta:
 *
 *   PS5/CREATE/Screenshots/Ghost of Tsushima/Ghost of Tsushima_20230115121314.jpg
 *   PS4/SHARE/Screenshots/Bloodborne/Bloodborne_20160101120000.jpg
 *
 * Así el usuario suelta la carpeta entera y cada captura cae sola en el juego
 * correcto, en vez de subirlas de a una ficha por ficha.
 *
 * Módulo puro a propósito (sin `import "server-only"`): es manipulación de
 * strings, corre en el cliente y se testea directo desde un spec, misma razón
 * que `lib/catalog/normalize.ts` y `lib/external-guides/steam-relevance.ts`.
 */
import { normalizeName } from "@/lib/catalog/normalize";

/**
 * Carpetas que pone la consola y no son nombres de juego. Se comparan
 * normalizadas (minúsculas, sin puntuación), así entran también las variantes
 * en español de la exportación localizada.
 */
const STRUCTURAL_FOLDERS = new Set([
  "ps4",
  "ps5",
  "share",
  "create",
  "screenshots",
  "screenshot",
  "capturas",
  "capturas de pantalla",
  "video clips",
  "videoclips",
  "clips de video",
  "dcim",
  "images",
  "imagenes",
  "fotos",
  "photos",
  "downloads",
  "descargas",
]);

/**
 * Sufijos de fecha/hora que la consola le pega al nombre del juego:
 * `_20230115121314`, `_20230115_121314`, `-2023-01-15-12-14-30`.
 *
 * Se exige la fecha completa (8 dígitos) a propósito: recortar cualquier grupo
 * de números final convertiría "Battlefield 2042" en "Battlefield" y el juego
 * dejaría de matchear.
 */
const TIMESTAMP_SUFFIX = /[ _-]*\d{4}[-_]?\d{2}[-_]?\d{2}([-_ ]?\d{2}){0,3}$/;

/** `Juego (1).jpg`: el contador que agrega el navegador al bajar repetido. */
const COUNTER_SUFFIX = /[ _-]*\(\d+\)$/;

export interface ImportCandidateFile {
  /** `file.name` */
  name: string;
  /** `file.webkitRelativePath`, vacío si el usuario eligió archivos sueltos. */
  relativePath?: string;
}

/**
 * Nombre de juego deducido de un archivo, o `null` si no se puede: una captura
 * bajada de la PS App se llama con un id opaco y no dice nada.
 *
 * La carpeta manda sobre el nombre del archivo: es más confiable (la consola la
 * escribe con el título completo) y sobrevive a los renombres del navegador.
 */
export function extractGameNameFromFile(file: ImportCandidateFile): string | null {
  const fromFolder = gameNameFromRelativePath(file.relativePath ?? "");
  if (fromFolder) return fromFolder;
  return cleanGameName(stripExtension(file.name));
}

function gameNameFromRelativePath(relativePath: string): string | null {
  const segments = relativePath.split("/").filter(Boolean);
  // El último segmento es el archivo; el resto, carpetas. Se toma la más
  // cercana al archivo que no sea estructural.
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    const candidate = segments[i];
    if (STRUCTURAL_FOLDERS.has(normalizeName(candidate))) continue;
    const cleaned = cleanGameName(candidate);
    if (cleaned) return cleaned;
  }
  return null;
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * Saca los sufijos de fecha/contador y normaliza separadores. Devuelve `null`
 * si lo que queda no parece un título (vacío, o puros dígitos: los nombres
 * opacos de la PS App caen acá).
 */
export function cleanGameName(raw: string): string | null {
  let name = raw.trim();
  // Se aplica más de una vez: `Juego_20230115_121314 (1)` deja primero el
  // contador, después la hora y después la fecha.
  for (let i = 0; i < 4; i += 1) {
    const next = name.replace(COUNTER_SUFFIX, "").replace(TIMESTAMP_SUFFIX, "").trim();
    if (next === name) break;
    name = next;
  }
  name = name.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (!/[a-z]/i.test(name)) return null;
  return name;
}

export interface MatchableGame {
  id: string;
  name: string;
}

/**
 * Busca el juego de la biblioteca que corresponde a un nombre deducido.
 * Primero exacto por `normalizeName` (que ya saca "Remastered", "Director's
 * Cut", etc.) y después por contención, quedándose con el nombre más largo:
 * entre "God of War" y "God of War Ragnarök", gana el que comparte más texto.
 */
export function matchGameByName<T extends MatchableGame>(
  candidate: string,
  games: readonly T[],
): T | null {
  const normalized = normalizeName(candidate);
  if (!normalized) return null;

  let best: T | null = null;
  let bestLength = 0;

  for (const game of games) {
    const gameNormalized = normalizeName(game.name);
    if (!gameNormalized) continue;
    if (gameNormalized === normalized) return game;

    const contains =
      gameNormalized.startsWith(`${normalized} `) || normalized.startsWith(`${gameNormalized} `);
    // Un prefijo de menos de 4 caracteres matchea cualquier cosa ("god", "the").
    if (contains && Math.min(gameNormalized.length, normalized.length) >= 4) {
      const length = Math.min(gameNormalized.length, normalized.length);
      if (length > bestLength) {
        best = game;
        bestLength = length;
      }
    }
  }

  return best;
}

export interface ImportGroup<T extends MatchableGame> {
  /** Nombre deducido, o `null` cuando el archivo no dice a qué juego pertenece. */
  detectedName: string | null;
  /** Juego de la biblioteca al que se asignó, `null` si no matcheó ninguno. */
  game: T | null;
  fileIndexes: number[];
}

/**
 * Agrupa los archivos elegidos por juego detectado, conservando el índice de
 * cada archivo para que el caller pueda seguir usando su `File` original.
 * Los que no se pudieron deducir caen todos juntos en un grupo con
 * `detectedName: null`, para que el usuario los asigne a mano.
 */
export function groupFilesByGame<T extends MatchableGame>(
  files: readonly ImportCandidateFile[],
  games: readonly T[],
): ImportGroup<T>[] {
  const groups = new Map<string, ImportGroup<T>>();

  files.forEach((file, index) => {
    const detectedName = extractGameNameFromFile(file);
    const game = detectedName ? matchGameByName(detectedName, games) : null;
    // La clave es el juego cuando matcheó (así dos carpetas que apuntan al
    // mismo juego se unen) y el nombre detectado cuando no.
    const key = game ? `game:${game.id}` : `name:${detectedName ?? ""}`;

    const existing = groups.get(key);
    if (existing) {
      existing.fileIndexes.push(index);
    } else {
      groups.set(key, { detectedName, game, fileIndexes: [index] });
    }
  });

  // Primero lo que sí matcheó: es lo que el usuario confirma de un vistazo.
  return [...groups.values()].sort((a, b) => {
    if (!!a.game !== !!b.game) return a.game ? -1 : 1;
    return (a.detectedName ?? "").localeCompare(b.detectedName ?? "");
  });
}
