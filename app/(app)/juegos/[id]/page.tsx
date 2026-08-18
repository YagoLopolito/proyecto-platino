import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { markTrophyObtained, unmarkTrophyObtained } from "./actions";
import { TrophyTypeIcon, type TrophyType } from "@/components/TrophyTypeIcon";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { ProgressBar } from "@/components/ProgressBar";
import { PlatinumBadge } from "@/components/PlatinumBadge";
import AiAdvisorPanel from "./AiAdvisorPanel";
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

const TYPE_LABEL: Record<string, string> = {
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
  platinum: "Platino",
};

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("user_games")
    .select("game_id")
    .eq("user_id", user.id)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, name, platform, cover_url, icon_url")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    notFound();
  }

  const { data: trophies, error: trophiesError } = await supabase
    .from("trophies")
    .select("id, name, description, type, hidden, icon_url")
    .eq("game_id", gameId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const PAGE_SIZE = 1000;
  const userTrophies: { trophy_id: string; unlocked_at: string | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page } = await supabase
      .from("user_trophies")
      .select("trophy_id, unlocked_at")
      .eq("user_id", user.id)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    userTrophies.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }

  const { data: cachedPlanRow } = await supabase
    .from("ai_game_plans")
    .select("payload_json")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .eq("status", "ok")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cachedPlan = (cachedPlanRow?.payload_json as AiGamePlan | undefined) ?? null;

  const obtained = new Map(userTrophies.map((row) => [row.trophy_id, row.unlocked_at]));
  const total = trophies?.length ?? 0;
  const obtainedCount = trophies?.filter((t) => obtained.has(t.id)).length ?? 0;
  const percent = total > 0 ? Math.round((obtainedCount / total) * 100) : 0;
  const isPlatinumed = (trophies ?? []).some((t) => t.type === "platinum" && obtained.has(t.id));

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-50">
      <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2">
          <p className="truncate text-sm text-zinc-400">{game.name}</p>
          <a
            href="#advisor"
            className="flex shrink-0 items-center gap-1.5 rounded border border-blue-700 bg-blue-900/30 px-3 py-1.5 text-sm text-blue-300 hover:border-blue-500"
          >
            ✨ Advisor con IA
          </a>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8">
        <GameBreadcrumb gameId={gameId} gameName={game.name} />

        <div className="flex items-center gap-4">
          {game.cover_url ?? game.icon_url ? (
            <Image
              src={game.cover_url ?? game.icon_url!}
              alt={game.name}
              width={64}
              height={64}
              unoptimized
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

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Trofeos {total > 0 && `(${total})`}</h2>

          {trophiesError && (
            <ErrorState message={`No se pudieron cargar los trofeos: ${trophiesError.message}`} />
          )}

          {!trophiesError && total === 0 && (
            <EmptyState title="Todavía no cargaste trofeos para este juego." />
          )}

          <ul className="space-y-2">
            {trophies?.map((trophy) => {
              const isObtained = obtained.has(trophy.id);
              return (
                <li
                  key={trophy.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {trophy.icon_url ? (
                      <Image
                        src={trophy.icon_url}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-800">
                        <TrophyTypeIcon type={trophy.type as TrophyType} className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {trophy.name}
                        {trophy.hidden && (
                          <span className="ml-2 text-xs text-zinc-500">(oculto)</span>
                        )}
                      </p>
                      {trophy.description && (
                        <p className="truncate text-xs text-zinc-500">{trophy.description}</p>
                      )}
                      <p className="flex items-center gap-1 text-xs text-zinc-500">
                        <TrophyTypeIcon type={trophy.type as TrophyType} className="h-3.5 w-3.5" />
                        {TYPE_LABEL[trophy.type] ?? trophy.type}
                      </p>
                    </div>
                  </div>
                  <form action={isObtained ? unmarkTrophyObtained : markTrophyObtained}>
                    <input type="hidden" name="trophyId" value={trophy.id} />
                    <input type="hidden" name="gameId" value={gameId} />
                    <button
                      type="submit"
                      className={
                        isObtained
                          ? "shrink-0 rounded border border-green-700 bg-green-900/30 px-3 py-1 text-sm text-green-400 hover:border-red-500 hover:text-red-400"
                          : "shrink-0 rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:border-blue-500 hover:text-blue-400"
                      }
                    >
                      {isObtained ? "Obtenido ✓" : "Marcar obtenido"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>

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
      </div>

      <Link
        href={`/juegos/${gameId}/enlaces`}
        className="fixed bottom-5 right-5 z-20 flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 shadow-lg hover:border-blue-500 hover:text-blue-300"
      >
        📖 Ver guías
      </Link>
    </div>
  );
}
