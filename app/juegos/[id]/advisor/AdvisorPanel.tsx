"use client";

import { useActionState } from "react";
import { generateAdvisorPlan, type AdvisorActionState } from "./actions";
import type { AiGamePlan } from "@/lib/ai";

type InitialPlan = {
  status: "ok" | "error";
  payload: AiGamePlan | { error: string };
  createdAt: string;
} | null;

const initialState: AdvisorActionState = { error: null, success: null };

export default function AdvisorPanel({
  gameId,
  initialPlan,
  trophyNameById,
}: {
  gameId: string;
  initialPlan: InitialPlan;
  trophyNameById: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(generateAdvisorPlan, initialState);

  const plan =
    initialPlan?.status === "ok" ? (initialPlan.payload as AiGamePlan) : null;
  const trophyLabel = (id: string) => trophyNameById[id] ?? id;

  return (
    <section className="space-y-4">
      <form action={formAction} className="flex items-center gap-3">
        <input type="hidden" name="gameId" value={gameId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {pending ? "Generando..." : plan ? "Regenerar plan" : "Generar plan"}
        </button>
        {initialPlan && (
          <span className="text-xs text-zinc-500">
            Última versión: {new Date(initialPlan.createdAt).toLocaleString()}
          </span>
        )}
      </form>

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      {!plan && !state.error && initialPlan?.status === "error" && (
        <p className="text-sm text-red-400">
          {(initialPlan.payload as { error: string }).error}
        </p>
      )}

      {!plan && !initialPlan && (
        <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Todavía no generaste un plan para este juego.
        </p>
      )}

      {plan && (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm text-zinc-200">{plan.resumen}</p>
            <p className="mt-2 text-xs text-zinc-400">
              {plan.puede_platinar_en_una_run
                ? "Se puede platinar en una sola partida."
                : "Necesita más de una partida."}
              {plan.notas_run_unica && ` ${plan.notas_run_unica}`}
            </p>
          </div>

          {plan.grupos_de_partidas.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-200">Partidas sugeridas</h2>
              <ul className="space-y-2">
                {plan.grupos_de_partidas.map((grupo, i) => (
                  <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
                    <p className="font-medium text-zinc-200">
                      Run {grupo.run}: {grupo.objetivo}
                    </p>
                    {grupo.trofeos_relacionados.length > 0 && (
                      <p className="mt-1 text-xs text-zinc-500">
                        {grupo.trofeos_relacionados.map(trophyLabel).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.missables.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-200">Missables</h2>
              <ul className="space-y-2">
                {plan.missables.map((m, i) => (
                  <li key={i} className="rounded-lg border border-red-900/50 bg-red-950/20 p-3 text-sm">
                    <p className="font-medium text-red-300">{trophyLabel(m.trofeo_id)}</p>
                    <p className="text-xs text-zinc-400">{m.motivo}</p>
                    {m.momento_limite && (
                      <p className="text-xs text-zinc-500">Límite: {m.momento_limite}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.orden_sugerido.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-200">Orden sugerido</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-300">
                {plan.orden_sugerido.map((id, i) => (
                  <li key={i}>{trophyLabel(id)}</li>
                ))}
              </ol>
            </div>
          )}

          {plan.tips_generales.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-200">Tips generales</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
                {plan.tips_generales.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
