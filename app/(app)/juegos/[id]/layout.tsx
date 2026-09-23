import type { ReactNode } from "react";
import { PlatinumBadge } from "@/components/PlatinumBadge";
import { CompletionBadge } from "@/components/CompletionBadge";
import { GameHero } from "@/components/game/GameHero";
import { GameActionPanel } from "@/components/game/GameActionPanel";
import { SwipeTabs } from "@/components/ui/SwipeTabs";
import { getGameDiary, getGamePageBase, getGameTrophyProgress } from "@/lib/game-page/data";
import { countFriendsPlaying, isPlayingGame } from "@/lib/now-playing/queries";

/**
 * Ficha de juego unificada (epic #183, issue #186): una sola pantalla con
 * tabs, como la ficha de una película en Letterboxd. Antes eran dos primas
 * (`/juegos/[id]` con los trofeos y `/juegos/[id]/diario` con las reseñas),
 * cada una con su propio hero.
 *
 * El layout monta lo que no cambia entre tabs -- el hero y el panel de
 * acciones -- y cada tab es una ruta: Reseñas (`/juegos/[id]`, la default),
 * Trofeos (`/trofeos`) y Guías e IA (`/guias`). Al cambiar de tab Next sólo
 * renderiza la página nueva; el hero no se vuelve a pedir.
 *
 * La ficha ya no exige que el juego esté en tu biblioteca: cualquier juego del
 * catálogo tiene la suya. Lo que depende de tu progreso (trofeos, advisor) lo
 * resuelve cada tab.
 */
export default async function GameLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: gameId } = await params;
  const [base, progress, diary, [isPlaying, friendsPlaying]] = await Promise.all([
    getGamePageBase(gameId),
    getGameTrophyProgress(gameId),
    getGameDiary(gameId),
    // "Jugando ahora" (issue #187): tu racha abierta y la de tus amigos. Cuelga
    // de la base (sesión) pero no de los trofeos ni del diario.
    getGamePageBase(gameId).then(({ supabase, userId }) =>
      Promise.all([
        isPlayingGame(supabase, userId, gameId),
        countFriendsPlaying(supabase, userId, gameId),
      ]),
    ),
  ]);

  const summary = diary.status === "ok" ? diary.summary : null;
  // Las partidas vienen ordenadas de la primera a la última: la puntuación que
  // se muestra como "tuya" es la de la más reciente que tenga una.
  const ownRating =
    [...(summary?.ownEntries ?? [])].reverse().find((entry) => entry.rating !== null)?.rating ??
    null;
  const isSteam = base.source === "steam";

  const tabs = [
    { href: `/juegos/${gameId}`, label: "Reseñas" },
    { href: `/juegos/${gameId}/trofeos`, label: isSteam ? "Logros" : "Trofeos" },
    { href: `/juegos/${gameId}/guias`, label: "Guías e IA" },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-x-clip bg-background text-ink">
      <div className="mx-auto w-full max-w-5xl px-4">
        <GameHero
          game={base.card}
          playtimeMinutes={base.playtimeMinutes}
          hasPlatinum={progress.hasPlatinumTrophy}
          badges={
            <>
              {progress.isPlatinumed && <PlatinumBadge />}
              {progress.isCompleted && <CompletionBadge />}
            </>
          }
          aside={
            <GameActionPanel
              gameId={gameId}
              isPlaying={isPlaying}
              friendsPlaying={friendsPlaying}
              ownRating={ownRating}
              ownEntriesCount={summary?.ownEntries.length ?? 0}
              community={
                summary && {
                  averageRating: summary.averageRating,
                  ratingCount: summary.ratingCount,
                  distribution: summary.distribution,
                }
              }
            />
          }
        />
      </div>

      <div className="mt-6">
        <SwipeTabs tabs={tabs} label="Ficha del juego">
          {children}
        </SwipeTabs>
      </div>
    </div>
  );
}
