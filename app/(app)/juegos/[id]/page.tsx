import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TrophyType } from "@/components/TrophyTypeIcon";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { ProgressBar } from "@/components/ProgressBar";
import { PlatinumBadge } from "@/components/PlatinumBadge";
import AiAdvisorPanel from "./AiAdvisorPanel";
import TrophyItem from "./TrophyItem";
import type { AiGamePlan } from "@/lib/ai";
import GameBreadcrumb from "@/components/GameBreadcrumb";

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
  ] = await Promise.all([
    supabase.from("games").select("id, name, platform, cover_url, icon_url").eq("id", gameId).single(),
    supabase
      .from("trophies")
      .select("id, name, description, type, hidden, icon_url, trophy_group_id, rarity, earned_rate, progress_target")
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
  ]);

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

  const obtained = new Map((userTrophies ?? []).map((row) => [row.trophy_id, row.unlocked_at]));
  const total = trophies?.length ?? 0;
  const obtainedCount = trophies?.filter((t) => obtained.has(t.id)).length ?? 0;
  const percent = total > 0 ? Math.round((obtainedCount / total) * 100) : 0;
  const isPlatinumed = (trophies ?? []).some((t) => t.type === "platinum" && obtained.has(t.id));

  // Si el juego tiene DLC/expansiones, PSN los trae como grupos de trofeos
  // aparte del "default" (juego base) -- se separan visualmente para poder
  // ver el % de completitud de cada uno por separado.
  const groupNameById = new Map((trophyGroups ?? []).map((g) => [g.group_id, g.name]));
  const trophyGroupOrder = Array.from(new Set((trophies ?? []).map((t) => t.trophy_group_id ?? "default")));
  const hasMultipleGroups = trophyGroupOrder.length > 1;

  const groupedTrophies = trophyGroupOrder.map((groupId) => {
    const groupTrophies = (trophies ?? []).filter((t) => (t.trophy_group_id ?? "default") === groupId);
    const groupObtainedCount = groupTrophies.filter((t) => obtained.has(t.id)).length;
    return {
      groupId,
      name: groupId === "default" ? "Juego base" : (groupNameById.get(groupId) ?? `DLC ${groupId}`),
      trophies: groupTrophies,
      obtainedCount: groupObtainedCount,
      total: groupTrophies.length,
      percent:
        groupTrophies.length > 0 ? Math.round((groupObtainedCount / groupTrophies.length) * 100) : 0,
    };
  });

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-50">
      <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2">
          <p className="truncate text-sm text-zinc-400">{game.name}</p>
          <nav className="flex shrink-0 items-center gap-1.5 text-sm">
            <a
              href="#trofeos"
              className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500"
            >
              🏆 Trofeos
            </a>
            <a
              href="#advisor"
              className="rounded border border-blue-700 bg-blue-900/30 px-3 py-1.5 text-blue-300 hover:border-blue-500"
            >
              ✨ Advisor IA
            </a>
            <Link
              href={`/juegos/${gameId}/guias`}
              className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500"
            >
              📖 Guías
            </Link>
            <Link
              href={`/juegos/${gameId}/enlaces`}
              className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500"
            >
              🔗 Enlaces
            </Link>
          </nav>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-10 px-4 py-8">
        <GameBreadcrumb gameId={gameId} gameName={game.name} />

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {game.cover_url ?? game.icon_url ? (
              <Image
                src={game.cover_url ?? game.icon_url!}
                alt={game.name}
                width={64}
                height={64}
                className="h-16 w-16 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-zinc-800 text-xs text-zinc-500">
                Sin img
              </div>
            )}
            <div className="space-y-1">
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                {game.name}
                {isPlatinumed && <PlatinumBadge />}
              </h1>
              <p className="text-sm text-zinc-400">{game.platform}</p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Completitud</span>
              <span className="font-medium">
                {obtainedCount}/{total} ({percent}%)
              </span>
            </div>
            <ProgressBar percent={percent} className="mt-2 h-2" />
          </div>
        </div>

        <section id="trofeos" className="scroll-mt-16 space-y-3 border-t border-zinc-800 pt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Trofeos {total > 0 && `(${total})`}
          </h2>

          {trophiesError && (
            <ErrorState message={`No se pudieron cargar los trofeos: ${trophiesError.message}`} />
          )}

          {!trophiesError && total === 0 && (
            <EmptyState title="Todavía no cargaste trofeos para este juego." />
          )}

          {hasMultipleGroups
            ? groupedTrophies.map((group) => (
                <div key={group.groupId} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <h3 className="text-sm font-medium text-zinc-300">{group.name}</h3>
                    <span className="text-xs text-zinc-500">
                      {group.obtainedCount}/{group.total} ({group.percent}%)
                    </span>
                  </div>
                  <ProgressBar percent={group.percent} className="h-1.5" />
                  <ul className="space-y-2">
                    {group.trophies.map((trophy) => (
                      <TrophyItem
                        key={trophy.id}
                        gameId={gameId}
                        trophyId={trophy.id}
                        name={trophy.name}
                        description={trophy.description}
                        type={trophy.type}
                        hidden={trophy.hidden}
                        iconUrl={trophy.icon_url}
                        isObtained={obtained.has(trophy.id)}
                        rarity={trophy.rarity}
                        earnedRate={trophy.earned_rate}
                        progressTarget={trophy.progress_target}
                      />
                    ))}
                  </ul>
                </div>
              ))
            : (
                <ul className="space-y-2">
                  {trophies?.map((trophy) => (
                    <TrophyItem
                      key={trophy.id}
                      gameId={gameId}
                      trophyId={trophy.id}
                      name={trophy.name}
                      description={trophy.description}
                      type={trophy.type}
                      hidden={trophy.hidden}
                      iconUrl={trophy.icon_url}
                      isObtained={obtained.has(trophy.id)}
                      rarity={trophy.rarity}
                      earnedRate={trophy.earned_rate}
                      progressTarget={trophy.progress_target}
                    />
                  ))}
                </ul>
              )}
        </section>

        <section id="advisor" className="scroll-mt-16 space-y-3 border-t border-zinc-800 pt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Advisor con IA</h2>
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
