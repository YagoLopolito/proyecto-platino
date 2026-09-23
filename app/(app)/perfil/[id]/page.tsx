import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublicProfile, getFavoriteGames } from "@/lib/profile/queries";
import { getUserDiaryEntries } from "@/lib/diary/queries";
import { profileLabel } from "@/lib/friends/constants";
import { ProfileHeader, ProfileBadge } from "@/components/profile/ProfileHeader";
import { ProfileStatStrip } from "@/components/profile/ProfileStatStrip";
import { FavoriteGamesSection } from "@/components/profile/FavoriteGamesSection";
import { NowPlayingSection } from "@/components/now-playing/NowPlayingSection";
import { getNowPlaying } from "@/lib/now-playing/queries";
import {
  DiaryPreviewSection,
  PROFILE_DIARY_PREVIEW_LIMIT,
} from "@/components/profile/DiaryPreviewSection";
import { FollowButton } from "@/components/profile/FollowButton";
import { SectionHeader, SectionAction } from "@/components/ui/SectionHeader";
import { ErrorState } from "@/components/ErrorState";
import { PSN_TROPHY_TYPES } from "@/components/TrophyTypeIcon";
import { TrophyTypeStrip } from "@/components/profile/TrophyTypeStrip";

/**
 * Perfil público de otro usuario: su Top 5, sus últimas partidas terminadas con
 * reseña, y el nivel/totales de trofeos que informa PSN.
 *
 * Todo lo que se muestra acá es público por diseño: `game_diary_entries` y
 * `user_favorite_games` tienen `select using (true)`, y el resto sale de la
 * vista `public_profiles`. Lo que **no** se puede mostrar es cualquier número
 * derivado de `user_trophies` (privado): de ahí que no haya progreso por juego
 * ni "juegos en biblioteca", que serían cero desde la sesión del que mira.
 */
export default async function PerfilPublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // El perfil propio tiene su propia pantalla (con el editor del Top 5, el
  // email y las acciones de la cuenta): un link a `/perfil/<mi id>` va ahí.
  if (id === user.id) {
    redirect("/perfil");
  }

  const [profile, favorites, nowPlaying, diaryOutcome, { data: friendRow }] = await Promise.all([
    getPublicProfile(supabase, id),
    getFavoriteGames(supabase, id),
    getNowPlaying(supabase, id),
    getUserDiaryEntries(supabase, id, PROFILE_DIARY_PREVIEW_LIMIT),
    supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id)
      .eq("friend_id", id)
      .maybeSingle(),
  ]);

  if (!profile) {
    notFound();
  }

  const name = profileLabel(profile);
  // En una variable aparte para que el narrowing sobreviva dentro de los
  // callbacks de más abajo (`profile.earned` es una propiedad opcional).
  const earned = profile.earned;
  const isFriend = friendRow !== null;
  const totalTrophies = earned ? PSN_TROPHY_TYPES.reduce((sum, type) => sum + earned[type], 0) : 0;

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <ProfileHeader
          name={name}
          subtitle={isFriend ? "Lo tenés agregado: sus partidas aparecen en tu diario." : undefined}
          avatarUrl={profile.avatarUrl}
          badges={
            profile.psnOnlineId ? (
              <ProfileBadge icon="gamepad">PSN · {profile.psnOnlineId}</ProfileBadge>
            ) : (
              <ProfileBadge>Sin PSN conectada</ProfileBadge>
            )
          }
          actions={<FollowButton userId={profile.id} isFriend={isFriend} />}
        />

        {earned && (
          <ProfileStatStrip
            stats={[
              {
                label: "Nivel PSN",
                value: profile.trophyLevel ?? "—",
                progressPercent: profile.trophyProgress,
              },
              { label: "Trofeos", value: totalTrophies },
              { label: "Platinos", value: earned.platinum },
            ]}
          />
        )}

        <FavoriteGamesSection
          games={favorites}
          emptyMessage={`${name} todavía no eligió su Top 5.`}
        />

        <NowPlayingSection games={nowPlaying} />

        {diaryOutcome.status === "error" ? (
          <ErrorState message={`No se pudo cargar el diario: ${diaryOutcome.message}`} />
        ) : (
          <DiaryPreviewSection
            entries={diaryOutcome.entries}
            ratingTone="others"
            emptyMessage={`${name} todavía no marcó ninguna partida como terminada.`}
            action={
              <Link href="/biblioteca/resenas">
                <SectionAction>Ver actividad</SectionAction>
              </Link>
            }
          />
        )}

        {earned && (
          <section className="space-y-3" aria-labelledby="psn-trophies-heading">
            <SectionHeader
              title={<span id="psn-trophies-heading">PlayStation Network · trofeos por tipo</span>}
            />
            <TrophyTypeStrip counts={earned} />
            <p className="type-caption text-ink-faint">
              Totales tal cual los informa PSN. El progreso por juego es privado: solo lo ve cada
              usuario en su propia biblioteca.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
