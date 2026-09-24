import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { EmptyState } from "@/components/EmptyState";
import { ProfileSubpage, formatInstant } from "@/components/profile/ProfileSubpage";
import { getOwnProfileSummary } from "@/lib/profile/summary";
import { countWithYear, yearOfInstant } from "@/lib/profile/stats";

export const metadata = { title: "100% en Steam" };

/**
 * Juegos de Steam al 100% (issue #196), el equivalente del platino. Va en su
 * propia pantalla, separado de los platinos de PSN: no son la misma unidad.
 */
export default async function CompletadosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { completions, year } = await getOwnProfileSummary(supabase, user.id);
  const count = countWithYear(
    completions.map((c) => yearOfInstant(c.completedAt)),
    year,
  );

  return (
    <ProfileSubpage
      title="100% en Steam"
      subtitle={`${count.total} en total · ${count.thisYear} en ${year}`}
    >
      {completions.length === 0 ? (
        <EmptyState
          icon="completed"
          title="Todavía no completaste ningún juego de Steam al 100%."
        />
      ) : (
        <PosterGrid>
          {completions.map((game) => (
            <li key={game.gameId} data-testid="completed-game">
              <GamePoster
                href={`/juegos/${game.gameId}`}
                name={game.name}
                imageUrl={game.imageUrl}
                isCompleted
                showName
                caption={<span className="text-ink-faint">{formatInstant(game.completedAt)}</span>}
              />
            </li>
          ))}
        </PosterGrid>
      )}
    </ProfileSubpage>
  );
}
