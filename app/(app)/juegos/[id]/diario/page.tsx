import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddDiaryEntryForm from "@/components/diary/AddDiaryEntryForm";
import EditDiaryEntryForm from "@/components/diary/EditDiaryEntryForm";
import GameBreadcrumb from "@/components/GameBreadcrumb";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { GameHero } from "@/components/diary/GameHero";
import { getGameCardData, GAME_CARD_COLUMNS } from "@/lib/catalog/details";
import { getGameDiarySummary } from "@/lib/diary/queries";
import { getGameScreenshots } from "@/lib/diary/screenshots";
import ScreenshotUploader from "@/components/diary/ScreenshotUploader";
import ScreenshotGallery from "@/components/diary/ScreenshotGallery";
import { ErrorState } from "@/components/ErrorState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Icon } from "@/components/ui/Icon";

export default async function GameDiaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select(GAME_CARD_COLUMNS)
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    notFound();
  }

  // El diario es público (a diferencia de user_trophies) -- se muestran las
  // entradas de todos los usuarios para este juego, ver CLAUDE.md.
  const [
    { data: entries, error: entriesError },
    diaryOutcome,
    card,
    screenshotsOutcome,
    { data: userGame },
    { count: platinumCount },
  ] = await Promise.all([
    supabase
      .from("game_diary_entries")
      .select(
        "id, user_id, playthrough_number, rating, review, finished_on, source, platinum_earned_at, completed_at",
      )
      .eq("game_id", gameId)
      .order("finished_on", { ascending: false }),
    getGameDiarySummary(supabase, gameId, user.id),
    getGameCardData(supabase, game),
    getGameScreenshots(supabase, gameId, user.id),
    // Las horas son del usuario que mira (la ficha en sí es pública).
    supabase
      .from("user_games")
      .select("playtime_minutes")
      .eq("user_id", user.id)
      .eq("game_id", gameId)
      .maybeSingle(),
    // Si el juego tiene platino: decide si el tiempo de completitud se muestra
    // como "Platino" o como "Al 100%" (Steam no tiene platino). `head: true`
    // porque sólo interesa el conteo, no las filas.
    supabase
      .from("trophies")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .eq("type", "platinum"),
  ]);

  const ownEntries = (entries ?? []).filter((entry) => entry.user_id === user.id);
  const otherEntries = (entries ?? []).filter((entry) => entry.user_id !== user.id);

  return (
    <div className="flex flex-1 flex-col overflow-x-clip bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="relative z-10">
          <GameBreadcrumb gameId={gameId} gameName={card.name} current="Diario" />
        </div>

        {diaryOutcome.status === "error" ? (
          <ErrorState message={`No se pudo cargar la puntuación: ${diaryOutcome.message}`} />
        ) : (
          <GameHero
            game={card}
            score={{
              average_rating: diaryOutcome.summary.averageRating,
              rating_count: diaryOutcome.summary.ratingCount,
            }}
            distribution={diaryOutcome.summary.distribution}
            playtimeMinutes={userGame?.playtime_minutes ?? null}
            hasPlatinum={(platinumCount ?? 0) > 0}
          />
        )}

        <section className="space-y-4">
          <SectionHeader title="Capturas" />
          <ScreenshotUploader gameId={gameId} userId={user.id} />
          {screenshotsOutcome.status === "error" ? (
            <ErrorState
              message={`No se pudieron cargar las capturas: ${screenshotsOutcome.message}`}
            />
          ) : (
            <ScreenshotGallery gameId={gameId} screenshots={screenshotsOutcome.screenshots} />
          )}
        </section>

        <AddDiaryEntryForm gameId={gameId} />

        <section className="space-y-4">
          {entriesError && (
            <p role="alert" className="type-body text-danger">
              No se pudieron cargar las entradas: {entriesError.message}
            </p>
          )}

          {!entriesError && ownEntries.length > 0 && (
            <div className="space-y-2">
              <SectionHeader title="Tus entradas" />
              {ownEntries.map((entry) => (
                <EditDiaryEntryForm key={entry.id} gameId={gameId} entry={entry} />
              ))}
            </div>
          )}

          {!entriesError && otherEntries.length > 0 && (
            <div className="space-y-2">
              <SectionHeader title="Otros usuarios" />
              {otherEntries.map((entry) => (
                <div key={entry.id} className="border-t border-border py-3 first:border-t-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-ink-muted">
                    <span>
                      Partida #{entry.playthrough_number} · {entry.finished_on}
                    </span>
                    <StarRatingDisplay rating={entry.rating} />
                    {entry.platinum_earned_at && (
                      <Icon
                        name="trophy"
                        className="h-4 w-4 text-trophy-platinum"
                        label="Platinado"
                      />
                    )}
                    {entry.completed_at && (
                      <Icon
                        name="completed"
                        className="h-4 w-4 text-success"
                        label="Completado al 100%"
                      />
                    )}
                  </span>
                  {/* La reseña es contenido editorial: serif de lectura, igual
                      que la descripción del juego en el hero. */}
                  {entry.review && (
                    <p className="mt-1.5 whitespace-pre-line break-words type-review text-ink">
                      {entry.review}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {!entriesError && (entries ?? []).length === 0 && (
            <p className="rounded-card border border-dashed border-border p-8 text-center type-body text-ink-muted">
              Todavía nadie marcó este juego como terminado. Sé el primero.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
