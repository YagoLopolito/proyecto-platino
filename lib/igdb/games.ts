import "server-only";
import { pickIgdbGame, type IgdbGameCandidate } from "@/lib/time-to-beat/match";
import { igdbImageUrl, igdbQuery, igdbString } from "./client";
import { IGDB_MOCKS_ENABLED, mockGameDetails, mockResolveGame } from "./mocks";

/**
 * Resultado de resolver un juego contra IGDB. Mismo contrato de tres estados
 * que los tiempos: `unavailable` (no se pudo preguntar) nunca se cachea.
 */
export type IgdbGameLookup =
  | { status: "ok"; id: number; name: string }
  | { status: "not_found" }
  | { status: "unavailable"; reason: string };

/**
 * Busca un juego por nombre y elige el candidato con `pickIgdbGame` (el mismo
 * match que usaban los tiempos: exacto, sufijo, similitud). Es **el único
 * match por nombre contra IGDB**: la ficha lo hace una vez y el id resultante
 * sirve para los tiempos y para los estudios.
 */
export async function resolveIgdbGame(gameName: string): Promise<IgdbGameLookup> {
  if (IGDB_MOCKS_ENABLED) return mockResolveGame(gameName);

  try {
    // `search` ordena por relevancia; se piden 10 porque el primero suele ser
    // un DLC o una edición cuando el título es de una saga larga.
    const found = await igdbQuery(
      "games",
      `search ${igdbString(gameName)}; fields id,name; limit 10;`,
    );
    if ("error" in found) {
      console.error(`[igdb] no se pudo buscar "${gameName}": ${found.error}`);
      return { status: "unavailable", reason: found.error };
    }

    const candidates: IgdbGameCandidate[] = found.rows.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const { id, name } = entry as Record<string, unknown>;
      return typeof id === "number" && typeof name === "string" ? [{ id, name }] : [];
    });

    const game = pickIgdbGame(gameName, candidates);
    if (!game) {
      // Caso esperable y frecuente: se loguea con los candidatos para poder
      // afinar el match.
      console.warn(
        `[igdb] sin match para "${gameName}" entre ${candidates.length} candidatos: ${candidates
          .map((c) => c.name)
          .join(" | ")}`,
      );
      return { status: "not_found" };
    }
    return { status: "ok", id: game.id, name: game.name };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`[igdb] falló la búsqueda de "${gameName}": ${reason}`);
    return { status: "unavailable", reason };
  }
}

export interface IgdbGameDetails {
  igdbId: number;
  name: string;
  coverUrl: string | null;
  releaseYear: number | null;
  description: string | null;
}

/**
 * Datos mínimos para materializar un juego de IGDB en `games` (los juegos de
 * un estudio que nadie tiene todavía). `null` = no existe o no se pudo
 * consultar: el caller responde 404 en vez de crear una ficha vacía.
 */
export async function fetchIgdbGameDetails(igdbId: number): Promise<IgdbGameDetails | null> {
  if (IGDB_MOCKS_ENABLED) return mockGameDetails(igdbId);

  try {
    const result = await igdbQuery(
      "games",
      `fields name,summary,cover.image_id,first_release_date; where id = ${igdbId}; limit 1;`,
    );
    if ("error" in result) {
      console.error(`[igdb] no se pudo leer el juego ${igdbId}: ${result.error}`);
      return null;
    }
    const first = result.rows[0];
    if (typeof first !== "object" || first === null) return null;
    const row = first as Record<string, unknown>;
    if (typeof row.name !== "string") return null;
    const cover = row.cover as Record<string, unknown> | undefined;
    return {
      igdbId,
      name: row.name,
      coverUrl: igdbImageUrl(cover?.image_id, "cover_big"),
      releaseYear: yearOf(row.first_release_date),
      description: typeof row.summary === "string" ? row.summary : null,
    };
  } catch (cause) {
    console.error(`[igdb] falló la lectura del juego ${igdbId}:`, cause);
    return null;
  }
}

/** `first_release_date` viene en segundos Unix. */
export function yearOf(unixSeconds: unknown): number | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).getUTCFullYear();
}
