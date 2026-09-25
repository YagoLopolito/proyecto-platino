import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { Button } from "@/components/Button";
import { Icon } from "@/components/ui/Icon";
import { isVisibleInLibrary } from "@/lib/library/visibility";
import { ProfileHeader, ProfileBadge } from "@/components/profile/ProfileHeader";
import { FavoriteGamesSection } from "@/components/profile/FavoriteGamesSection";
import { RecentReviewsSection } from "@/components/profile/RecentReviewsSection";
import { RatingHistogram } from "@/components/profile/RatingHistogram";
import { ProfileStatsMenu, type ProfileStatRow } from "@/components/profile/ProfileStatsMenu";
import { TopFiveEditor } from "@/components/profile/TopFiveEditor";
import { NowPlayingSection } from "@/components/now-playing/NowPlayingSection";
import { getNowPlaying } from "@/lib/now-playing/queries";
import { getFavoriteGames } from "@/lib/profile/queries";
import { getOwnBio, getProfileCounts } from "@/lib/profile/overview";
import { getOwnProfileSummary } from "@/lib/profile/summary";
import { countWithYear, ratingHistogram, yearOfDate, yearOfInstant } from "@/lib/profile/stats";

/**
 * Perfil › Perfil (epic #183, issue #196). Orden de la pantalla, el de la app
 * de Letterboxd: cabecera, Favoritos (Top 5), Jugando ahora, Últimas reseñas,
 * Tus puntuaciones y Estadísticas. En escritorio las tres primeras van en la
 * columna de contenido y las dos últimas en un sidebar; el orden del DOM es el
 * mismo que en mobile.
 *
 * Los números de trofeos de PSN (nivel, desglose por tipo) ya no están acá:
 * viven en el expandido de Platinos.
 */
export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: psnAccount },
    { data: steamAccount },
    { data: libraryRows },
    { data: statsRows },
    favorites,
    nowPlaying,
    summary,
    counts,
    bio,
    { data: shownProfile },
  ] = await Promise.all([
    supabase
      .from("psn_accounts")
      .select("online_id, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("steam_accounts").select("persona_name").eq("user_id", user.id).maybeSingle(),
    // La biblioteca visible alimenta al editor del Top 5 (mismo criterio que
    // /biblioteca vía `isVisibleInLibrary`).
    supabase
      .from("user_games")
      .select("game_id, playtime_minutes, games!inner (id, name, cover_url, icon_url, source)")
      .eq("user_id", user.id),
    supabase.rpc("get_library_trophy_stats"),
    getFavoriteGames(supabase, user.id),
    getNowPlaying(supabase, user.id),
    getOwnProfileSummary(supabase, user.id),
    getProfileCounts(supabase, user.id),
    getOwnBio(supabase, user.id),
    // Nombre y foto según la plataforma elegida en Configuración › Perfil
    // (resuelto en `public_profiles`, igual que lo ven los demás).
    supabase
      .from("public_profiles")
      .select("profile_name, profile_avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const statsByGame = new Map((statsRows ?? []).map((row) => [row.game_id, row]));
  // Candidatos del editor del Top 5: la biblioteca visible, alfabética (el
  // editor filtra por nombre).
  const favoriteCandidates = (libraryRows ?? [])
    .filter((row) =>
      isVisibleInLibrary({
        source: row.games?.source ?? null,
        playtimeMinutes: row.playtime_minutes,
        obtained: statsByGame.get(row.game_id)?.obtained ?? 0,
      }),
    )
    .flatMap((row) =>
      row.games
        ? [
            {
              id: row.games.id,
              name: row.games.name,
              imageUrl: row.games.cover_url ?? row.games.icon_url,
            },
          ]
        : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const { year, entries, platinums, completions, played } = summary;
  const diary = countWithYear(
    entries.map((entry) => yearOfDate(entry.finishedOn)),
    year,
  );
  const platinumCount = countWithYear(
    platinums.map((p) => yearOfInstant(p.unlockedAt)),
    year,
  );
  const completionCount = countWithYear(
    completions.map((c) => yearOfInstant(c.completedAt)),
    year,
  );
  const reviewCount = entries.filter((entry) => entry.review?.trim()).length;

  // Platinos y 100% son filas separadas: un platino de PSN y un 100% de Steam
  // no son la misma unidad y no se suman (ver CLAUDE.md).
  const statRows: ProfileStatRow[] = [
    {
      label: "Juegos jugados",
      href: "/perfil/jugados",
      value: played.total,
      thisYear: played.thisYear,
    },
    {
      label: "Platinos",
      href: "/perfil/platinos",
      value: platinumCount.total,
      thisYear: platinumCount.thisYear,
    },
    ...(steamAccount || completions.length > 0
      ? [
          {
            label: "100% en Steam",
            href: "/perfil/completados",
            value: completionCount.total,
            thisYear: completionCount.thisYear,
          },
        ]
      : []),
    { label: "Diario", href: "/perfil/diario", value: diary.total, thisYear: diary.thisYear },
    { label: "Reseñas", href: "/perfil/resenas", value: reviewCount },
    { label: "Playlist", href: "/perfil/playlist", value: counts.playlist },
    { label: "Listas", href: "/perfil/listas", value: counts.lists },
    { label: "Likes", href: "/perfil/likes", value: counts.likesGiven },
    { label: "Siguiendo", href: "/perfil/siguiendo", value: counts.following },
    { label: "Seguidores", href: "/perfil/seguidores", value: counts.followers },
    { label: "Resumen del año", href: "/diario/resumen" },
  ];

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <ProfileHeader
          name={shownProfile?.profile_name ?? "Perfil"}
          subtitle={user.email}
          bio={bio}
          avatarUrl={shownProfile?.profile_avatar_url ?? null}
          badges={
            <>
              {psnAccount && (
                <ProfileBadge icon="gamepad">PSN · {psnAccount.online_id}</ProfileBadge>
              )}
              {steamAccount && (
                <ProfileBadge icon="monitor">
                  Steam · {steamAccount.persona_name ?? "conectada"}
                </ProfileBadge>
              )}
              {!psnAccount && !steamAccount && (
                <ProfileBadge>Sin plataformas conectadas</ProfileBadge>
              )}
            </>
          }
        />

        <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10 lg:space-y-0">
          <div className="space-y-8">
            <FavoriteGamesSection
              games={favorites}
              emptyMessage="Todavía no elegiste tus favoritos. Elegí hasta 5 juegos para mostrarlos acá."
              action={
                <TopFiveEditor
                  games={favoriteCandidates}
                  selectedIds={favorites.map((game) => game.id)}
                />
              }
            />

            {/* Sin `emptyMessage`: si no estás jugando nada, la sección no aparece. */}
            <NowPlayingSection games={nowPlaying} canStop />

            <RecentReviewsSection entries={entries} />
          </div>

          <aside className="space-y-8" aria-label="Puntuaciones y estadísticas">
            <RatingHistogram histogram={ratingHistogram(entries)} />
            <ProfileStatsMenu rows={statRows} />
          </aside>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
          {!psnAccount && (
            <Link
              href="/configuracion/conexiones"
              className="type-meta font-medium text-accent-ink hover:underline"
            >
              Conectar cuenta PSN
            </Link>
          )}
          <form action={logout} className="ml-auto">
            <Button type="submit" variant="secondary">
              <Icon name="logout" className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
