import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AiGamePlan } from "@/lib/ai";
import AdvisorPanel from "./AdvisorPanel";

export default async function GameAdvisorPage({ params }: { params: Promise<{ id: string }> }) {
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
    .select("id, name")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    notFound();
  }

  const { data: latestPlan } = await supabase
    .from("ai_game_plans")
    .select("id, payload_json, status, created_at")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: trophies } = await supabase
    .from("trophies")
    .select("id, name")
    .eq("game_id", gameId);
  const trophyNameById = new Map((trophies ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Advisor con IA</h1>
          <p className="text-sm text-zinc-400">{game.name}</p>
        </div>

        <AdvisorPanel
          gameId={gameId}
          trophyNameById={Object.fromEntries(trophyNameById)}
          initialPlan={
            latestPlan
              ? {
                  status: latestPlan.status as "ok" | "error",
                  payload: latestPlan.payload_json as AiGamePlan | { error: string },
                  createdAt: latestPlan.created_at,
                }
              : null
          }
        />

        <Link href={`/juegos/${gameId}`} className="text-sm text-blue-400 hover:underline">
          ← Volver al juego
        </Link>
      </div>
    </div>
  );
}
