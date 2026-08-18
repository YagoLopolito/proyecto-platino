import "server-only";
import {
  getTitleTrophies,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  type AuthorizationPayload,
  type TrophyTitle,
} from "psn-api";
import { mapWithConcurrency } from "./concurrency";
import { mapPsnPlatformToLocal, type Platform } from "./platform";

/** Cuántos títulos se procesan en simultáneo. Ni tan bajo que el sync tarde minutos con bibliotecas grandes, ni tan alto que parezca polling agresivo. */
const TITLE_FETCH_CONCURRENCY = 5;

export type FetchedTrophy = {
  npTrophyId: number;
  name: string;
  description: string | null;
  type: "bronze" | "silver" | "gold" | "platinum";
  hidden: boolean;
  iconUrl: string | null;
  sortOrder: number;
  earned: boolean;
  earnedAt: string | null;
  /** "default" para el juego base, "001"/"002"/etc. para DLC/expansiones (ver psn-api). */
  groupId: string;
};

export type FetchedTitle = {
  npCommId: string;
  name: string;
  iconUrl: string | null;
  platform: Platform | null;
  lastPlayedAt: string | null;
  trophies: FetchedTrophy[];
};

function npServiceNameFor(trophyTitlePlatform: string): "trophy" | "trophy2" {
  return trophyTitlePlatform.toUpperCase().includes("PS5") ? "trophy2" : "trophy";
}

async function fetchAllTitles(authorization: AuthorizationPayload): Promise<TrophyTitle[]> {
  const titles: TrophyTitle[] = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const page = await getUserTitles(authorization, "me", { limit, offset });
    titles.push(...page.trophyTitles);
    if (page.trophyTitles.length < limit || titles.length >= page.totalItemCount) {
      break;
    }
    offset += limit;
  }

  return titles;
}

/**
 * Ambos endpoints de PSN paginan igual que `getUserTitles`: con títulos de
 * muchos trofeos (DLC incluido vía "all"), una sola página se corta antes de
 * llegar a `totalItemCount` -- típicamente dejando afuera los últimos
 * bronces. Sin este loop, juegos viejos con muchos DLC quedaban con
 * trofeos ya desbloqueados marcados como no obtenidos.
 */
async function fetchAllPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<{ trophies: T[]; totalItemCount: number }>,
): Promise<T[]> {
  const items: T[] = [];
  const limit = 100;
  let offset = 0;

  for (;;) {
    const page = await fetchPage(limit, offset);
    items.push(...page.trophies);
    if (page.trophies.length < limit || items.length >= page.totalItemCount) {
      break;
    }
    offset += limit;
  }

  return items;
}

async function fetchTrophiesForTitle(
  authorization: AuthorizationPayload,
  title: TrophyTitle,
): Promise<FetchedTrophy[]> {
  const npServiceName = npServiceNameFor(title.trophyTitlePlatform);

  const [definitions, earnedTrophies] = await Promise.all([
    fetchAllPages((limit, offset) =>
      getTitleTrophies(authorization, title.npCommunicationId, "all", {
        npServiceName,
        limit,
        offset,
      }),
    ),
    fetchAllPages((limit, offset) =>
      getUserTrophiesEarnedForTitle(authorization, "me", title.npCommunicationId, "all", {
        npServiceName,
        limit,
        offset,
      }),
    ),
  ]);

  const earnedByTrophyId = new Map(earnedTrophies.map((t) => [t.trophyId, t]));

  return definitions.map((trophy, index) => {
    const earned = earnedByTrophyId.get(trophy.trophyId);
    return {
      npTrophyId: trophy.trophyId,
      name: trophy.trophyName ?? "",
      description: trophy.trophyDetail ?? null,
      type: trophy.trophyType,
      hidden: trophy.trophyHidden,
      iconUrl: trophy.trophyIconUrl ?? null,
      sortOrder: index,
      earned: earned?.earned ?? false,
      earnedAt: earned?.earnedDateTime ?? null,
      groupId: trophy.trophyGroupId ?? "default",
    };
  });
}

/** Trae todos los juegos jugados por el usuario autenticado, con su lista completa de trofeos y progreso. */
export async function fetchUserTitlesWithTrophies(
  authorization: AuthorizationPayload,
): Promise<FetchedTitle[]> {
  const titles = await fetchAllTitles(authorization);

  return mapWithConcurrency(titles, TITLE_FETCH_CONCURRENCY, async (title) => {
    const trophies = await fetchTrophiesForTitle(authorization, title);
    return {
      npCommId: title.npCommunicationId,
      name: title.trophyTitleName,
      iconUrl: title.trophyTitleIconUrl ?? null,
      platform: mapPsnPlatformToLocal(title.trophyTitlePlatform),
      // PSN a veces devuelve lastUpdatedDateTime como string vacío para
      // juegos sin actividad; eso rompe el upsert a un timestamptz, así
      // que se descarta cualquier valor que no sea una fecha válida.
      lastPlayedAt:
        title.lastUpdatedDateTime && !Number.isNaN(Date.parse(title.lastUpdatedDateTime))
          ? title.lastUpdatedDateTime
          : null,
      trophies,
    };
  });
}
