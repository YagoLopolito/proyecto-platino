import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GamesLibrary, { type LibraryGame } from "./GamesLibrary";
import type { PsnTrophyType } from "@/components/TrophyTypeIcon";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { SyncStatusBadge, type SyncTokenStatus } from "@/components/SyncStatusBadge";
import { isVisibleInLibrary } from "@/lib/library/visibility";
import SyncButton from "@/components/psn/SyncButton";
import { NowPlayingSection } from "@/components/now-playing/NowPlayingSection";
import { PlaySuggestionBanner } from "@/components/now-playing/PlaySuggestionBanner";
import { getNowPlaying, getPlaySuggestion } from "@/lib/now-playing/queries";
import RecommendationsSection from "@/components/diary/RecommendationsSection";
import { getCachedRecommendations } from "@/lib/diary/recommendations";
import { selectNearPlatinum } from "@/lib/library/near-platinum";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterRow, PosterRowItem } from "@/components/game/PosterGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";

type GameStats = {
  total: number;
  obtained: number;
  percent: number;
  counts: Record<PsnTrophyType, number>;
};

/** Fuentes que la biblioteca sabe filtrar. Cualquier otro valor cae a "todas". */
const SOURCE_FILTERS = ["psn", "steam"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number] | "todos";

function parseSourceFilter(raw: string | undefined): SourceFilter {
  return SOURCE_FILTERS.includes(raw as (typeof SOURCE_FILTERS)[number])
    ? (raw as SourceFilter)
    : "todos";
}

const SOURCE_LABEL: Record<SourceFilter, string> = {
  todos: "Todos",
  psn: "PSN",
  steam: "Steam",
};

/**
 * Biblioteca › Juegos (epic #183, issue #191): la "home" de la app. A
 * diferencia de Letterboxd, la primera tab es **tu** biblioteca y no lo
 * popular. Arriba, el estado de sync en una línea; debajo, las secciones.
 */
export default async function BibliotecaJuegosPage({
  searchParams,
}: {
  searchParams: Promise<{ fuente?: string }>;
}) {
  // Query param y no estado de cliente: así el filtro es linkeable, sobrevive
  // al refresh, y sobre todo se puede aplicar en la query de Postgres en vez de
  // traer toda la biblioteca para esconder la mitad en el browser.
  const fuente = parseSourceFilter((await searchParams).fuente);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const userId = user.id;

  // get_library_trophy_stats agrega total/obtenidos por juego con GROUP BY en Postgres
  // (ver migración 20260820020000) en vez de traer miles de filas de trophies/
  // user_trophies a memoria del servidor y sumar en JS con paginado manual -- con
  // bibliotecas grandes eso eran más de 10 round-trips seriales solo para esta página.
  // `games!inner` para poder filtrar por una columna del juego desde
  // `user_games`: sin el inner join, PostgREST devuelve igual la fila con
  // `games: null` en vez de descartarla.
  let libraryQuery = supabase
    .from("user_games")
    .select(
      "added_at, last_played_at, playtime_minutes, games!inner (id, name, platform, cover_url, icon_url, source)",
    )
    .order("last_played_at", { ascending: false, nullsFirst: false })
    .order("added_at", { ascending: false });

  if (fuente !== "todos") {
    libraryQuery = libraryQuery.eq("games.source", fuente);
  }

  const [
    { data: psnAccount },
    { data: steamAccount },
    { data: library, error },
    { data: statsRows },
    nowPlaying,
  ] = await Promise.all([
    supabase
      .from("psn_accounts")
      .select("token_status, last_synced_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("steam_accounts").select("persona_name").eq("user_id", userId).maybeSingle(),
    libraryQuery,
    supabase.rpc("get_library_trophy_stats"),
    getNowPlaying(supabase, userId),
  ]);

  // Después y no en paralelo: las dos reusan las stats del RPC en vez de
  // pedirlas de nuevo, que es la consulta cara de esta página.
  const [suggestion, cachedRecommendations] = await Promise.all([
    getPlaySuggestion(supabase, userId, { forBanner: true, stats: statsRows ?? [] }),
    getCachedRecommendations(supabase, userId, statsRows ?? []),
  ]);

  const statsByGame = new Map<string, GameStats>();
  for (const row of statsRows ?? []) {
    statsByGame.set(row.game_id, {
      total: row.total,
      obtained: row.obtained,
      percent: row.total > 0 ? Math.round((row.obtained / row.total) * 100) : 0,
      counts: { platinum: row.platinum, gold: row.gold, silver: row.silver, bronze: row.bronze },
    });
  }

  // Qué se lista y qué no lo decide `isVisibleInLibrary` (juegos de catálogo y
  // basura de Steam), compartido con /perfil para que los dos cuenten igual.
  const games: LibraryGame[] = (library ?? []).flatMap((row) => {
    const game = row.games;
    if (!game) return [];
    const stats = statsByGame.get(game.id) ?? {
      total: 0,
      obtained: 0,
      percent: 0,
      counts: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
    };

    if (
      !isVisibleInLibrary({
        source: game.source,
        playtimeMinutes: row.playtime_minutes,
        obtained: stats.obtained,
      })
    ) {
      return [];
    }

    return {
      id: game.id,
      name: game.name,
      platform: game.platform,
      imageUrl: game.cover_url ?? game.icon_url,
      addedAt: row.added_at,
      lastPlayedAt: row.last_played_at,
      total: stats.total,
      obtained: stats.obtained,
      percent: stats.percent,
      counts: stats.counts,
      source: game.source,
      playtimeMinutes: row.playtime_minutes,
    };
  });

  const nearPlatinum = selectNearPlatinum(
    games.map((game) => ({ ...game, platinumObtained: game.counts.platinum })),
  );

  return (
    // max-w-5xl (antes 2xl): la biblioteca es una grilla de carátulas, y a
    // 672px de ancho entraban tres columnas con mucho aire muerto a los lados.
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="type-title text-ink">Mi biblioteca</h1>
            {psnAccount && <SyncStatusBadge status={psnAccount.token_status as SyncTokenStatus} />}
            {/*
             * Estado de sync: antes eran tres párrafos y un botón antes de la
             * primera carátula. Ahora es una sola línea al lado del título
             * (issue #176 §4): en una app de navegar, lo primero que se ve
             * tiene que ser el contenido.
             */}
            {psnAccount?.token_status === "valid" && (
              <SyncButton reconnectHref="/configuracion/conexiones#reconectar-psn" />
            )}
          </div>

          <p className="type-caption text-ink-muted">
            {psnAccount ? (
              <>
                {psnAccount.last_synced_at
                  ? `Última sincronización: ${new Date(psnAccount.last_synced_at).toLocaleString("es-AR")}.`
                  : "Todavía no se sincronizó ningún juego."}{" "}
                {psnAccount.token_status !== "valid" && (
                  <>
                    Reconectá tu cuenta para seguir sincronizando.{" "}
                    <Link
                      href="/configuracion/conexiones#reconectar-psn"
                      className="text-accent-ink hover:underline"
                    >
                      Reconectar cuenta PSN
                    </Link>
                    .
                  </>
                )}
              </>
            ) : (
              <>
                Tus juegos y trofeos se traen automáticamente desde tu cuenta PSN.{" "}
                <Link href="/configuracion/conexiones" className="text-accent-ink hover:underline">
                  Conectar cuenta
                </Link>
                .
              </>
            )}
          </p>

          {/* El selector solo tiene sentido con las dos plataformas conectadas:
              con una sola, dos de los tres botones dan vacío siempre.

              Es un marco único con las opciones adentro -- la forma de
              `SegmentedControl` -- y no tres píldoras sueltas, pero se queda
              como links y no como el componente: el filtro vive en la URL y se
              aplica en la query de Postgres, así que cada opción ES una
              navegación (linkeable, con "atrás" del browser), no un onChange. */}
          {psnAccount && steamAccount && (
            <nav
              aria-label="Filtrar por plataforma"
              className="inline-flex items-center rounded-card border border-border-strong bg-surface p-0.5"
            >
              {(["todos", ...SOURCE_FILTERS] as SourceFilter[]).map((value) => (
                <Link
                  key={value}
                  href={value === "todos" ? "/biblioteca" : `/biblioteca?fuente=${value}`}
                  aria-current={fuente === value ? "page" : undefined}
                  className={`flex min-h-10 items-center justify-center whitespace-nowrap rounded-chip px-3 type-caption font-medium transition-colors sm:min-h-9 ${
                    fuente === value
                      ? // Igual que el activo del `SegmentedControl`: el marco
                        // interno va en `accent-ink` porque es un borde de
                        // control y le toca 3:1 (WCAG 1.4.11).
                        "bg-accent/15 text-accent-ink shadow-[inset_0_0_0_1px_var(--color-accent-ink)]"
                      : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                  }`}
                >
                  {SOURCE_LABEL[value]}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {/*
         * Secciones en el orden del issue #191: lo que estás jugando, lo que la
         * IA te sugiere, lo que tenés a un paso y, al final, la biblioteca
         * entera. Las tres primeras son carruseles (`PosterRow`): ahí importa
         * el orden, no ver todo.
         *
         * "Jugando ahora" va arriba de todo (issue #187): es lo que abrís la
         * app para seguir. La sugerencia del sync va justo antes, porque si
         * la aceptás es ahí donde aparece el juego.
         */}
        {suggestion && <PlaySuggestionBanner gameId={suggestion.id} gameName={suggestion.name} />}
        <NowPlayingSection games={nowPlaying} />

        <RecommendationsSection
          recommendations={cachedRecommendations?.recommendations ?? null}
          games={[...(cachedRecommendations?.gamesById.values() ?? [])]}
          generatedAt={cachedRecommendations?.createdAt ?? null}
        />

        {nearPlatinum.length > 0 && (
          <section className="space-y-3" aria-labelledby="near-platinum-heading">
            <SectionHeader
              title={<span id="near-platinum-heading">Cerca del platino</span>}
              description="Más del 80% y todavía sin cerrar: lo que tenés a un paso."
            />
            <PosterRow>
              {nearPlatinum.map((game) => (
                <PosterRowItem key={game.id}>
                  <GamePoster
                    href={`/juegos/${game.id}`}
                    name={game.name}
                    imageUrl={game.imageUrl}
                    progress={game}
                    showName
                    caption={<span className="tabular-nums">{game.percent}%</span>}
                  />
                </PosterRowItem>
              ))}
            </PosterRow>
          </section>
        )}

        {error && <ErrorState message={`No se pudo cargar la biblioteca: ${error.message}`} />}

        {!error && games.length === 0 && fuente !== "todos" ? (
          <EmptyState
            icon="gamepad"
            title={`No tenés juegos de ${SOURCE_LABEL[fuente]} sincronizados. Sincronizá esa cuenta desde Configuración › Conexiones.`}
            action={
              <Link href="/biblioteca" className="text-accent-ink hover:underline">
                Ver todos los juegos
              </Link>
            }
          />
        ) : (
          !error && <GamesLibrary games={games} />
        )}
      </div>
    </div>
  );
}
