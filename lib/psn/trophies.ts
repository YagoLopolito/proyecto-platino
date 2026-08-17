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

async function fetchTrophiesForTitle(
  authorization: AuthorizationPayload,
  title: TrophyTitle,
): Promise<FetchedTrophy[]> {
  const npServiceName = npServiceNameFor(title.trophyTitlePlatform);

  const [definitions, earnedStatus] = await Promise.all([
    getTitleTrophies(authorization, title.npCommunicationId, "all", { npServiceName }),
    getUserTrophiesEarnedForTitle(authorization, "me", title.npCommunicationId, "all", {
      npServiceName,
    }),
  ]);

  const earnedByTrophyId = new Map(earnedStatus.trophies.map((t) => [t.trophyId, t]));

  return definitions.trophies.map((trophy, index) => {
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
      lastPlayedAt: title.lastUpdatedDateTime ?? null,
      trophies,
    };
  });
}
