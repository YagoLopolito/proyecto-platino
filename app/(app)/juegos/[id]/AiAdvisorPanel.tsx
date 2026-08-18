"use client";

import { useActionState } from "react";
import { generateAiPlan, type AiPlanActionState } from "./ai-actions";
import type { AiGamePlan } from "@/lib/ai";

const initialAiPlanState: AiPlanActionState = { plan: null, error: null };

const TYPE_LABEL: Record<string, string> = {
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
  platinum: "Platino",
};

function trophyLabel(trophies: { id: string; name: string; type: string }[], trophyId: string) {
  const trophy = trophies.find((t) => t.id === trophyId);
  return trophy ? `${trophy.name} (${TYPE_LABEL[trophy.type] ?? trophy.type})` : trophyId;
}

function PlanView({
  plan,
  trophies,
}: {
  plan: AiGamePlan;
  trophies: { id: string; name: string; type: string }[];
}) {
  return (
    <div className="space-y-4 text-sm text-zinc-200">
      <p>{plan.resumen}</p>

      <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <p className="font-medium text-zinc-100">
          {plan.puede_platinar_en_una_run
            ? "Se puede platinar en una sola partida"
            : "Necesita más de una partida"}
        </p>
        {plan.notas_run_unica && (
          <p className="mt-1 text-xs text-zinc-400">{plan.notas_run_unica}</p>
        )}
      </div>

      {plan.grupos_de_partidas.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Grupos de partidas
          </h4>
          <ul className="space-y-2">
            {plan.grupos_de_partidas.map((grupo) => (
              <li key={grupo.run} className="rounded border border-zinc-800 p-3">
                <p className="font-medium">Run {grupo.run}</p>
                <p className="text-xs text-zinc-400">{grupo.objetivo}</p>
                {grupo.trofeos_relacionados.length > 0 && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {grupo.trofeos_relacionados
                      .map((id) => trophyLabel(trophies, id))
                      .join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.missables.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Trofeos perdibles (missables)
          </h4>
          <ul className="space-y-2">
            {plan.missables.map((m, i) => (
              <li key={`${m.trofeo_id}-${i}`} className="rounded border border-amber-900/50 bg-amber-950/20 p-3">
                <p className="font-medium text-amber-200">{trophyLabel(trophies, m.trofeo_id)}</p>
                <p className="text-xs text-zinc-400">{m.motivo}</p>
                {m.momento_limite && (
                  <p className="mt-1 text-xs text-amber-400">Límite: {m.momento_limite}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.orden_sugerido.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Orden sugerido
          </h4>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-300">
            {plan.orden_sugerido.map((id) => (
              <li key={id}>{trophyLabel(trophies, id)}</li>
            ))}
          </ol>
        </div>
      )}

      {plan.tips_generales.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Tips generales
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-300">
            {plan.tips_generales.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AiAdvisorPanel({
  gameId,
  trophies,
  cachedPlan,
}: {
  gameId: string;
  trophies: { id: string; name: string; type: string }[];
  cachedPlan: AiGamePlan | null;
}) {
  const [state, formAction, pending] = useActionState<AiPlanActionState, FormData>(
    generateAiPlan,
    initialAiPlanState,
  );

  const plan = state.plan ?? (state.error ? null : cachedPlan);
  const hasPlan = plan !== null;

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Advisor con IA</h2>
          <p className="text-xs text-zinc-500">
            Contenido generado por IA: puede tener errores, verificá contra la guía oficial si el
            trofeo es importante.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="gameId" value={gameId} />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded border border-blue-700 bg-blue-900/30 px-3 py-1.5 text-sm text-blue-300 hover:border-blue-500 disabled:opacity-50"
          >
            {pending ? "Generando..." : hasPlan ? "Regenerar plan" : "Generar plan"}
          </button>
        </form>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      {!hasPlan && !state.error && !pending && (
        <p className="rounded border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
          Todavía no se generó un plan para este juego.
        </p>
      )}

      {plan && <PlanView plan={plan} trophies={trophies} />}
    </section>
  );
}
