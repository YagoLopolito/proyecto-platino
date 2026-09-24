import "server-only";
import { cache } from "react";
import type { createClient } from "@/lib/supabase/server";
import { getUserDiaryEntries, type DiaryTimelineEntry } from "@/lib/diary/queries";
import { getPlatinums, type PlatinumGame } from "./overview";
import {
  currentYear,
  summarizePlayed,
  yearOfDate,
  yearOfInstant,
  type PlayedEvent,
  type PlayedSummary,
} from "./stats";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface CompletedGame {
  gameId: string;
  name: string;
  imageUrl: string | null;
  completedAt: string;
}

export interface PlayedGame {
  gameId: string;
  name: string;
  imageUrl: string | null;
  isPlatinum: boolean;
  isCompleted: boolean;
}

export interface OwnProfileSummary {
  year: number;
  entries: DiaryTimelineEntry[];
  platinums: PlatinumGame[];
  completions: CompletedGame[];
  played: PlayedSummary & { games: PlayedGame[] };
}

/**
 * Todo lo que el perfil propio y sus expandidos derivan del diario y de los
 * platinos (issue #196). Con `cache()` para que una pantalla que lo pide dos
 * veces en el mismo request no repita las consultas.
 */
export const getOwnProfileSummary = cache(async function getOwnProfileSummary(
  supabase: Client,
  userId: string,
): Promise<OwnProfileSummary> {
  const [diary, platinums] = await Promise.all([
    getUserDiaryEntries(supabase, userId),
    getPlatinums(supabase, userId),
  ]);
  const entries = diary.status === "ok" ? diary.entries : [];
  const year = currentYear();

  // El 100% de Steam sale del diario (`completed_at`, lo escribe el sync), uno
  // por juego: la entrada más reciente con esa marca.
  const completionsByGame = new Map<string, CompletedGame>();
  for (const entry of entries) {
    if (!entry.completedAt || completionsByGame.has(entry.gameId)) continue;
    completionsByGame.set(entry.gameId, {
      gameId: entry.gameId,
      name: entry.gameName,
      imageUrl: entry.imageUrl,
      completedAt: entry.completedAt,
    });
  }
  const completions = Array.from(completionsByGame.values()).sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt),
  );

  // Orden de la grilla de "Juegos jugados": lo más reciente primero, mezclando
  // los tres orígenes por su fecha.
  const dated: (PlayedEvent & { at: string; game: PlayedGame })[] = [
    ...platinums.map((p) => ({
      gameId: p.gameId,
      year: yearOfInstant(p.unlockedAt),
      at: p.unlockedAt,
      game: {
        gameId: p.gameId,
        name: p.name,
        imageUrl: p.imageUrl,
        isPlatinum: true,
        isCompleted: false,
      },
    })),
    ...completions.map((c) => ({
      gameId: c.gameId,
      year: yearOfInstant(c.completedAt),
      at: c.completedAt,
      game: {
        gameId: c.gameId,
        name: c.name,
        imageUrl: c.imageUrl,
        isPlatinum: false,
        isCompleted: true,
      },
    })),
    ...entries.map((e) => ({
      gameId: e.gameId,
      year: yearOfDate(e.finishedOn),
      at: e.finishedOn,
      game: {
        gameId: e.gameId,
        name: e.gameName,
        imageUrl: e.imageUrl,
        isPlatinum: e.isPlatinum,
        isCompleted: e.isCompleted,
      },
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const summary = summarizePlayed(dated, year);
  const platinumIds = new Set(platinums.map((p) => p.gameId));
  const completedIds = new Set(completions.map((c) => c.gameId));
  const firstByGame = new Map<string, PlayedGame>();
  for (const event of dated)
    if (!firstByGame.has(event.gameId)) firstByGame.set(event.gameId, event.game);
  const games = summary.gameIds.map((id) => {
    const game = firstByGame.get(id)!;
    return { ...game, isPlatinum: platinumIds.has(id), isCompleted: completedIds.has(id) };
  });

  return { year, entries, platinums, completions, played: { ...summary, games } };
});
