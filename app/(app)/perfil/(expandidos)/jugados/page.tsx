import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { EmptyState } from "@/components/EmptyState";
import { ProfileSubpage } from "@/components/profile/ProfileSubpage";
import { getOwnProfileSummary } from "@/lib/profile/summary";

export const metadata = { title: "Juegos jugados" };

/**
 * Juegos jugados (issue #196): platinados en PSN, al 100% en Steam o con una
 * entrada en el diario, cada uno una sola vez. Lo más reciente primero.
 */
export default async function JugadosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { played, year } = await getOwnProfileSummary(supabase, user.id);

  return (
    <ProfileSubpage
      title="Juegos jugados"
      subtitle={`${played.total} en total · ${played.thisYear} en ${year}`}
    >
      {played.games.length === 0 ? (
        <EmptyState
          icon="gamepad"
          title="Todavía no hay juegos jugados."
          description="Cuenta un juego cuando lo platinás, lo completás al 100% en Steam o lo registrás en tu diario."
        />
      ) : (
        <PosterGrid>
          {played.games.map((game) => (
            <li key={game.gameId} data-testid="played-game">
              <GamePoster
                href={`/juegos/${game.gameId}`}
                name={game.name}
                imageUrl={game.imageUrl}
                isPlatinum={game.isPlatinum}
                isCompleted={game.isCompleted}
                showName
              />
            </li>
          ))}
        </PosterGrid>
      )}
    </ProfileSubpage>
  );
}
