import { getFavoriteGames } from "@/lib/profile/queries";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import { getOtherProfileContext } from "@/lib/profile/other";
import { getNowPlaying } from "@/lib/now-playing/queries";
import { ProfileHeader, ProfileBadge } from "@/components/profile/ProfileHeader";
import { FavoriteGamesSection } from "@/components/profile/FavoriteGamesSection";
import { RecentReviewsSection } from "@/components/profile/RecentReviewsSection";
import { RatingHistogram } from "@/components/profile/RatingHistogram";
import { ProfileStatsMenu, type ProfileStatRow } from "@/components/profile/ProfileStatsMenu";
import { NowPlayingSection } from "@/components/now-playing/NowPlayingSection";
import { FollowButton } from "@/components/profile/FollowButton";
import { ErrorState } from "@/components/ErrorState";
import { countWithYear, currentYear, ratingHistogram, yearOfDate } from "@/lib/profile/stats";

/**
 * Perfil › Perfil de otro usuario (epic #183, issue #197): las mismas
 * secciones que el propio (Favoritos, Jugando ahora, Últimas reseñas,
 * puntuaciones y Estadísticas), sin editores y con "Seguir" en la cabecera.
 *
 * Todo sale de datos públicos: el diario, el Top 5, jugando, la playlist, las
 * listas públicas y los totales de PSN de `public_profiles`. **Nada derivado de
 * `user_trophies`** (privado): desde la sesión de quien mira daría cero. Por eso
 * "Juegos jugados" cuenta sólo el diario y "Platinos" es el total que informa
 * PSN, y cada fila lo aclara. Seguidores/Siguiendo tampoco: la RLS de
 * `friendships` sólo deja ver las filas donde participa quien mira.
 */
export default async function PerfilAjenoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, viewerId, profile, name } = await getOtherProfileContext(id);

  const head = { count: "exact" as const, head: true };
  const [
    favorites,
    nowPlaying,
    diaryOutcome,
    { data: friendRow },
    { count: playlistCount },
    { count: listCount },
  ] = await Promise.all([
    getFavoriteGames(supabase, id),
    getNowPlaying(supabase, id),
    getUserDiaryEntries(supabase, id),
    supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", viewerId)
      .eq("friend_id", id)
      .maybeSingle(),
    supabase.from("user_playlist").select("game_id", head).eq("user_id", id),
    supabase.from("user_lists").select("id", head).eq("user_id", id).eq("visibility", "public"),
  ]);

  const isFriend = friendRow !== null;
  const entries = diaryOutcome.status === "ok" ? diaryOutcome.entries : [];
  const year = currentYear();
  const diary = countWithYear(
    entries.map((entry) => yearOfDate(entry.finishedOn)),
    year,
  );
  // Juegos distintos del diario, con el año de su primera partida registrada
  // (las entradas vienen de la más nueva a la más vieja: la última gana).
  const firstYearByGame = new Map<string, number>();
  for (const entry of entries) firstYearByGame.set(entry.gameId, yearOfDate(entry.finishedOn));
  const played = countWithYear([...firstYearByGame.values()], year);

  const statRows: ProfileStatRow[] = [
    {
      label: "Juegos jugados",
      note: "según su diario",
      href: `/perfil/${id}/diario`,
      value: played.total,
      thisYear: played.thisYear,
    },
    ...(profile.earned
      ? [{ label: "Platinos", note: "total que informa PSN", value: profile.earned.platinum }]
      : []),
    {
      label: "Diario",
      href: `/perfil/${id}/diario`,
      value: diary.total,
      thisYear: diary.thisYear,
    },
    { label: "Reseñas", value: entries.filter((entry) => entry.review?.trim()).length },
    { label: "Playlist", href: `/perfil/${id}/playlist`, value: playlistCount ?? 0 },
    { label: "Listas", href: `/perfil/${id}/listas`, value: listCount ?? 0 },
  ];

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <ProfileHeader
          name={name}
          subtitle={isFriend ? "Lo seguís: sus reseñas aparecen en tu actividad." : undefined}
          avatarUrl={profile.avatarUrl}
          badges={
            profile.profilePlatform && profile.profileName ? (
              <ProfileBadge icon={profile.profilePlatform === "steam" ? "monitor" : "gamepad"}>
                {profile.profilePlatform === "steam" ? "Steam" : "PSN"} · {profile.profileName}
              </ProfileBadge>
            ) : (
              <ProfileBadge>Sin cuentas conectadas</ProfileBadge>
            )
          }
          actions={<FollowButton userId={profile.id} isFriend={isFriend} />}
        />

        <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10 lg:space-y-0">
          <div className="space-y-8">
            <FavoriteGamesSection
              games={favorites}
              emptyMessage={`${name} todavía no eligió sus favoritos.`}
            />

            <NowPlayingSection games={nowPlaying} />

            {diaryOutcome.status === "error" ? (
              <ErrorState message={`No se pudo cargar el diario: ${diaryOutcome.message}`} />
            ) : (
              <RecentReviewsSection
                entries={entries}
                tone="others"
                emptyMessage={`${name} todavía no marcó ninguna partida como terminada.`}
                more={{ href: `/perfil/${id}/diario`, label: "Ver su diario" }}
              />
            )}
          </div>

          <aside className="space-y-8" aria-label="Puntuaciones y estadísticas">
            <RatingHistogram
              histogram={ratingHistogram(entries)}
              title="Sus puntuaciones"
              emptyMessage={`${name} todavía no puntuó ningún juego.`}
              linkToReviews={false}
            />
            <ProfileStatsMenu rows={statRows} />
          </aside>
        </div>
      </div>
    </div>
  );
}
