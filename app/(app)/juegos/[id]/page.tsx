import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TrophyType } from "@/components/TrophyTypeIcon";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { PlatinumBadge } from "@/components/PlatinumBadge";
import { CompletionBadge } from "@/components/CompletionBadge";
import AiAdvisorPanel from "./AiAdvisorPanel";
import TrophyList, { type TrophyListGroup } from "./TrophyList";
import type { AiGamePlan } from "@/lib/ai";
import GameBreadcrumb from "@/components/GameBreadcrumb";
import { GameScore } from "@/components/diary/GameScore";
import { GameDiarySection } from "@/components/diary/GameDiarySection";
import { getGameDiarySummary } from "@/lib/diary/queries";
import { getGameCardData, GAME_CARD_COLUMNS } from "@/lib/catalog/details";
import { GameDetailHero } from "@/components/game/GameDetailHero";
import { SectionHeader, SectionAction } from "@/components/ui/SectionHeader";
import { formatPlaytime } from "@/lib/playtime";

/**
 * El botón "Generar plan" invoca generateAiPlan (ai-actions.ts), que llama a
 * Claude y puede reintentar una vez si el schema falla -- puede pasar los
 * 10s por defecto de una función de Vercel. maxDuration para un Server
 * Action va en la página que lo invoca, no en el archivo "use server" (ver
 * https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#maxduration).
 */
export const maxDuration = 60;

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const userId = user.id;

  const { data: membership } = await supabase
    .from("user_games")
    .select("game_id")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  // Estas 4 queries solo dependen de la membership ya confirmada arriba, no entre sí.
  const [
    { data: game, error: gameError },
    { data: trophies, error: trophiesError },
    { data: trophyGroups },
    { data: cachedPlanRow },
    diaryOutcome,
    { data: userGame },
  ] = await Promise.all([
    // Las mismas columnas que la ficha de diario: el encabezado ahora es el
    // mismo wallpaper + carátula grande, y sale de `getGameCardData`.
    supabase.from("games").select(`${GAME_CARD_COLUMNS}, source`).eq("id", gameId).single(),
    supabase
      .from("trophies")
      .select(
        "id, name, description, type, hidden, icon_url, trophy_group_id, rarity, earned_rate, progress_target",
      )
      .eq("game_id", gameId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase.from("trophy_groups").select("group_id, name, icon_url").eq("game_id", gameId),
    supabase
      .from("ai_game_plans")
      .select("payload_json")
      .eq("game_id", gameId)
      .eq("user_id", userId)
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getGameDiarySummary(supabase, gameId, userId),
    supabase
      .from("user_games")
      .select("playtime_minutes")
      .eq("user_id", userId)
      .eq("game_id", gameId)
      .maybeSingle(),
  ]);

  const diarySummary = diaryOutcome.status === "ok" ? diaryOutcome.summary : null;

  if (gameError || !game) {
    notFound();
  }

  // Filtrada por los trofeos de este juego en vez de traer TODOS los user_trophies
  // de la cuenta (podían ser miles, con paginado manual serial -- ver CLAUDE.md).
  const trophyIds = (trophies ?? []).map((t) => t.id);
  const { data: userTrophies } = trophyIds.length
    ? await supabase
        .from("user_trophies")
        .select("trophy_id, unlocked_at")
        .eq("user_id", userId)
        .in("trophy_id", trophyIds)
    : { data: [] as { trophy_id: string; unlocked_at: string | null }[] };

  const cachedPlan = (cachedPlanRow?.payload_json as AiGamePlan | undefined) ?? null;

  // Descripción, fondo, año y desarrolladora se cachean en `games` la primera
  // vez que alguien abre una ficha (ver lib/catalog/details.ts): esta pantalla
  // y la de diario comparten ese caché, así que abrir una calienta la otra.
  const card = await getGameCardData(supabase, game);

  const obtained = new Map((userTrophies ?? []).map((row) => [row.trophy_id, row.unlocked_at]));
  const total = trophies?.length ?? 0;
  const obtainedCount = trophies?.filter((t) => obtained.has(t.id)).length ?? 0;
  const percent = total > 0 ? Math.round((obtainedCount / total) * 100) : 0;
  const isSteam = game.source === "steam";
  // Steam no tiene platino: el equivalente es el 100% de los logros, y va con
  // su propio badge para no mezclarlo con el platino de PSN.
  const isPlatinumed =
    !isSteam && (trophies ?? []).some((t) => t.type === "platinum" && obtained.has(t.id));
  const isCompleted = isSteam && total > 0 && obtainedCount === total;

  // Si el juego tiene DLC/expansiones, PSN los trae como grupos de trofeos
  // aparte del "default" (juego base) -- se separan visualmente para poder
  // ver el % de completitud de cada uno por separado.
  const groupNameById = new Map((trophyGroups ?? []).map((g) => [g.group_id, g.name]));
  const trophyGroupOrder = Array.from(
    new Set((trophies ?? []).map((t) => t.trophy_group_id ?? "default")),
  );
  const hasMultipleGroups = trophyGroupOrder.length > 1;

  const groupedTrophies: TrophyListGroup[] = trophyGroupOrder.map((groupId) => ({
    groupId,
    name: groupId === "default" ? "Juego base" : (groupNameById.get(groupId) ?? `DLC ${groupId}`),
    trophies: (trophies ?? [])
      .filter((t) => (t.trophy_group_id ?? "default") === groupId)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
        hidden: t.hidden,
        icon_url: t.icon_url,
        rarity: t.rarity,
        earned_rate: t.earned_rate,
        progress_target: t.progress_target,
        obtained: obtained.has(t.id),
      })),
  }));

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-50">
      <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        {/*
         * Igual que el header de la app: en mobile el nombre del juego va en su
         * propia fila y la nav de secciones queda a lo ancho, scrolleable
         * horizontalmente (las pills no entran en 375px sin desbordar la página).
         */}
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1.5 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="truncate text-sm text-zinc-400">{card.name}</p>
          <nav className="-mx-4 flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 text-sm sm:mx-0 sm:overflow-visible sm:px-0">
            <a
              href="#trofeos"
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 sm:min-h-0"
            >
              🏆 Trofeos
            </a>
            <a
              href="#advisor"
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded border border-blue-700 bg-blue-900/30 px-3 py-1.5 text-blue-300 hover:border-blue-500 sm:min-h-0"
            >
              ✨ Advisor IA
            </a>
            <Link
              href={`/juegos/${gameId}/enlaces`}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 sm:min-h-0"
            >
              🔗 Enlaces
            </Link>
            <a
              href="#diario"
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 sm:min-h-0"
            >
              📔 Diario
            </a>
          </nav>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:space-y-10 sm:py-8">
        <GameBreadcrumb gameId={gameId} gameName={card.name} />

        <GameDetailHero
          game={card}
          badges={
            <>
              {isPlatinumed && <PlatinumBadge />}
              {isCompleted && <CompletionBadge />}
            </>
          }
          stats={[
            { label: isSteam ? "Logros" : "Trofeos", value: `${obtainedCount}/${total}` },
            { label: "Completitud", value: `${percent}%` },
            { label: "Horas", value: formatPlaytime(userGame?.playtime_minutes) },
            {
              label: "Comunidad",
              value: diarySummary ? (
                <GameScore
                  score={{
                    average_rating: diarySummary.averageRating,
                    rating_count: diarySummary.ratingCount,
                  }}
                />
              ) : null,
            },
          ]}
        />

        <section id="trofeos" className="scroll-mt-28 space-y-3 pt-2 sm:scroll-mt-16">
          <SectionHeader
            title={
              <>
                {isSteam ? "Logros" : "Trofeos"}{" "}
                {total > 0 && <span className="text-zinc-600">{total}</span>}
              </>
            }
          />

          {trophiesError && (
            <ErrorState message={`No se pudieron cargar los trofeos: ${trophiesError.message}`} />
          )}

          {!trophiesError && total === 0 && (
            <EmptyState title="Todavía no cargaste trofeos para este juego." />
          )}

          {!trophiesError && total > 0 && (
            <TrophyList gameId={gameId} groups={groupedTrophies} showGroups={hasMultipleGroups} />
          )}
        </section>

        <section id="diario" className="scroll-mt-28 space-y-3 pt-2 sm:scroll-mt-16">
          <SectionHeader
            title="Diario"
            action={
              <Link href={`/juegos/${gameId}/diario`}>
                <SectionAction>Ver ficha</SectionAction>
              </Link>
            }
          />
          {diaryOutcome.status === "error" ? (
            <ErrorState message={`No se pudo cargar el diario: ${diaryOutcome.message}`} />
          ) : (
            <GameDiarySection gameId={gameId} summary={diaryOutcome.summary} />
          )}
        </section>

        <section id="advisor" className="scroll-mt-28 space-y-3 pt-2 sm:scroll-mt-16">
          <SectionHeader title="Advisor con IA" />
          <AiAdvisorPanel
            gameId={gameId}
            trophies={(trophies ?? []).map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              type: t.type as TrophyType,
              obtained: obtained.has(t.id),
            }))}
            cachedPlan={cachedPlan}
          />
        </section>
      </div>
    </div>
  );
}
