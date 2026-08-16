import "server-only";
import {
  getTitleTrophies,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  type AuthTokensResponse,
  type Trophy,
  type TrophyTitle,
} from "psn-api";

export type FetchedTrophy = Trophy & { earned: boolean; earnedDateTime?: string };

export type FetchedTitle = {
  title: TrophyTitle;
  trophies: FetchedTrophy[];
};

/** Trae todos los juegos con trofeos del usuario, con metadata + estado de desbloqueo de cada trofeo. */
export async function fetchUserTitlesWithTrophies(
  authorization: AuthTokensResponse,
): Promise<FetchedTitle[]> {
  const results: FetchedTitle[] = [];
  let offset = 0;

  while (true) {
    const page = await getUserTitles(authorization, "me", { limit: 100, offset });

    for (const title of page.trophyTitles) {
      const npServiceName = title.npServiceName;

      const [metadata, earned] = await Promise.all([
        getTitleTrophies(authorization, title.npCommunicationId, "all", { npServiceName }),
        getUserTrophiesEarnedForTitle(authorization, "me", title.npCommunicationId, "all", {
          npServiceName,
        }),
      ]);

      const earnedById = new Map(earned.trophies.map((t) => [t.trophyId, t]));

      const trophies: FetchedTrophy[] = metadata.trophies.map((trophy) => {
        const earnedTrophy = earnedById.get(trophy.trophyId);
        return {
          ...trophy,
          earned: earnedTrophy?.earned ?? false,
          earnedDateTime: earnedTrophy?.earnedDateTime,
        };
      });

      results.push({ title, trophies });
    }

    offset += page.trophyTitles.length;
    if (offset >= page.totalItemCount || page.trophyTitles.length === 0) break;
  }

  return results;
}
