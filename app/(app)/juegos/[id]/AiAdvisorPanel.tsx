"use client";

import { useActionState, type ReactNode } from "react";
import { generateAiPlan, type AiPlanActionState } from "./ai-actions";
import { TrophyTypeIcon, type TrophyType, trophyTypeLabel } from "@/components/TrophyTypeIcon";
import { focusTrophy } from "./focusTrophy";
import type { AiGamePlan } from "@/lib/ai";

const initialAiPlanState: AiPlanActionState = { plan: null, error: null };

export type AdvisorTrophy = {
  id: string;
  name: string;
  description: string | null;
  type: TrophyType;
  obtained: boolean;
};

function findTrophy(trophies: AdvisorTrophy[], trophyId: string) {
  return trophies.find((t) => t.id === trophyId);
}

/** Chip de trofeo: nombre + tipo, tachado/atenuado si ya se obtuvo, con la
 * descripción como tooltip nativo al hacer hover. Al clickearlo lleva al
 * trofeo en la lista de arriba y le abre la ayuda de "cómo desbloquearlo"
 * (ver `focusTrophy.ts`). */
function TrophyChip({ trophies, trophyId }: { trophies: AdvisorTrophy[]; trophyId: string }) {
  const trophy = findTrophy(trophies, trophyId);
  if (!trophy) {
    return <span className="text-zinc-400">{trophyId}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => focusTrophy(trophy.id)}
      title={`${trophy.description ?? "Sin descripción cargada."}

Clic para ver cómo desbloquearlo.`}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-left hover:border-blue-500 hover:text-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        trophy.obtained
          ? "border-green-800 bg-green-950/30 text-green-500 line-through decoration-green-700"
          : "border-zinc-700 bg-zinc-950 text-zinc-200"
      }`}
    >
      <TrophyTypeIcon type={trophy.type} className="h-3 w-3 shrink-0" />
      {trophy.name}
      <span className="text-[10px] text-zinc-500">({trophyTypeLabel(trophy.type)})</span>
      {trophy.obtained && <span className="text-green-500">✓</span>}
    </button>
  );
}

/** Etiqueta legible de cada categoría de desafío que devuelve el modelo. */
const CHALLENGE_LABELS: Record<AiGamePlan["desafios_de_dificultad"][number]["categoria"], string> =
  {
    dificultad_maxima: "Dificultad máxima",
    speedrun: "Contrarreloj",
    sin_morir: "Sin morir",
    permadeath: "Muerte permanente",
    sin_recursos: "Recursos limitados",
    otro_desafio: "Desafío de habilidad",
  };

/** Etiqueta legible de cada categoría de trofeo de acumulación. */
const COUNTER_LABELS: Record<AiGamePlan["acumulables"][number]["categoria"], string> = {
  bajas_con_condicion: "Bajas con condición",
  coleccionables: "Coleccionables",
  acciones_repetidas: "Acciones repetidas",
  recursos: "Recursos",
  progresion_larga: "Progresión larga",
};

/**
 * Resuelve cuál es el próximo trofeo a encarar. El plan está cacheado y los
 * trofeos se siguen sincronizando, así que la sugerencia del modelo puede
 * haber quedado obsoleta: si ese trofeo ya se obtuvo (o no está en la lista),
 * se cae al primer pendiente del orden sugerido, y recién ahí al primer
 * pendiente del juego. Así la tarjeta nunca propone algo ya desbloqueado.
 */
function resolveNextTrophy(
  plan: AiGamePlan,
  trophies: AdvisorTrophy[],
): { trophy: AdvisorTrophy; porQue: string; pasos: string[] } | null {
  const suggested = plan.siguiente_trofeo;
  if (suggested) {
    const trophy = findTrophy(trophies, suggested.trofeo_id);
    if (trophy && !trophy.obtained) {
      return { trophy, porQue: suggested.por_que, pasos: suggested.pasos ?? [] };
    }
  }

  const fromOrder = plan.orden_sugerido
    .map((id) => findTrophy(trophies, id))
    .find((t) => t !== undefined && !t.obtained);
  const fallback = fromOrder ?? trophies.find((t) => !t.obtained);
  return fallback ? { trophy: fallback, porQue: "", pasos: [] } : null;
}

/** Tarjeta destacada arriba del plan: qué trofeo encarar ahora y cómo. */
function NextTrophyCard({ plan, trophies }: { plan: AiGamePlan; trophies: AdvisorTrophy[] }) {
  const next = resolveNextTrophy(plan, trophies);

  if (!next) {
    return (
      <div className="rounded-lg border border-green-800/60 bg-green-950/20 p-3 text-sm text-green-300">
        🎉 No te queda ningún trofeo pendiente en este juego.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/20 p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300">
        <span aria-hidden="true">🎯</span>
        Siguiente trofeo
      </h4>
      <button
        type="button"
        onClick={() => focusTrophy(next.trophy.id)}
        className="flex w-full items-center gap-2 rounded border border-emerald-800/60 bg-zinc-950 p-2 text-left hover:border-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <TrophyTypeIcon type={next.trophy.type} className="h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <span className="block font-medium text-zinc-100">{next.trophy.name}</span>
          <span className="block text-xs text-zinc-400">
            {next.trophy.description ?? "Sin descripción cargada."}
          </span>
        </span>
      </button>
      {next.porQue && <p className="mt-2 text-xs text-emerald-300">{next.porQue}</p>}
      {next.pasos.length > 0 ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-300">
          {next.pasos.map((paso, i) => (
            <li key={i}>{paso}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Clickeá el trofeo para ver cómo desbloquearlo.</p>
      )}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  accent,
  children,
}: {
  icon: string;
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-lg border border-zinc-800 border-l-4 ${accent} bg-zinc-950 p-3`}>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        <span aria-hidden="true">{icon}</span>
        {title}
      </h4>
      {children}
    </div>
  );
}

function PlanView({ plan, trophies }: { plan: AiGamePlan; trophies: AdvisorTrophy[] }) {
  const pendingCount = trophies.filter((t) => !t.obtained).length;

  return (
    <div className="space-y-4 text-sm text-zinc-200">
      <p className="leading-relaxed text-zinc-300">{plan.resumen}</p>

      <NextTrophyCard plan={plan} trophies={trophies} />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-800/50 bg-blue-950/20 p-3">
        <span className="text-xl">{plan.puede_platinar_en_una_run ? "🏆" : "🔁"}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-100">
            {plan.puede_platinar_en_una_run
              ? "Se puede platinar en una sola partida"
              : "Necesita más de una partida"}
          </p>
          {plan.notas_run_unica && (
            <p className="mt-0.5 text-xs text-zinc-400">{plan.notas_run_unica}</p>
          )}
        </div>
        {pendingCount > 0 && (
          <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
            Te faltan {pendingCount}
          </span>
        )}
      </div>

      {plan.grupos_de_partidas.length > 0 && (
        <SectionCard icon="🕹️" title="Grupos de partidas" accent="border-l-blue-600">
          <ul className="space-y-2">
            {plan.grupos_de_partidas.map((grupo) => (
              <li key={grupo.run} className="rounded border border-zinc-800 bg-zinc-900 p-2.5">
                <p className="font-medium text-zinc-100">Run {grupo.run}</p>
                <p className="text-xs text-zinc-400">{grupo.objetivo}</p>
                {grupo.trofeos_relacionados.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {grupo.trofeos_relacionados.map((id) => (
                      <TrophyChip key={id} trophies={trophies} trophyId={id} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {plan.missables.length > 0 && (
        <SectionCard icon="⚠️" title="Trofeos perdibles (missables)" accent="border-l-amber-600">
          <ul className="space-y-2">
            {plan.missables.map((m, i) => (
              <li
                key={`${m.trofeo_id}-${i}`}
                className="rounded border border-amber-900/50 bg-amber-950/20 p-2.5"
              >
                <div className="mb-1">
                  <TrophyChip trophies={trophies} trophyId={m.trofeo_id} />
                </div>
                <p className="text-xs text-zinc-400">{m.motivo}</p>
                {m.momento_limite && (
                  <p className="mt-1 text-xs text-amber-400">Límite: {m.momento_limite}</p>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {(plan.desafios_de_dificultad ?? []).length > 0 && (
        <SectionCard icon="🔥" title="Trofeos de dificultad" accent="border-l-red-600">
          <ul className="space-y-2">
            {(plan.desafios_de_dificultad ?? []).map((d, i) => (
              <li
                key={`${d.trofeo_id}-${i}`}
                className="rounded border border-red-900/50 bg-red-950/20 p-2.5"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <TrophyChip trophies={trophies} trophyId={d.trofeo_id} />
                  <span className="rounded-full border border-red-800 bg-red-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
                    {CHALLENGE_LABELS[d.categoria] ?? d.categoria}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">{d.motivo}</p>
                {d.consejo && <p className="mt-1 text-xs text-red-300">{d.consejo}</p>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {(plan.acumulables ?? []).length > 0 && (
        <SectionCard icon="🎯" title="Contadores a tener en cuenta" accent="border-l-indigo-600">
          <p className="mb-2 text-xs text-zinc-500">
            Trofeos que piden acumular una cantidad. Conviene saberlos antes de empezar la historia:
            no son difíciles, pero se llega al final con el contador a medias.
          </p>
          <ul className="space-y-2">
            {(plan.acumulables ?? []).map((a, i) => (
              <li
                key={`${a.trofeo_id}-${i}`}
                className="rounded border border-indigo-900/50 bg-indigo-950/20 p-2.5"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <TrophyChip trophies={trophies} trophyId={a.trofeo_id} />
                  <span className="rounded-full border border-indigo-800 bg-indigo-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-indigo-300">
                    {COUNTER_LABELS[a.categoria] ?? a.categoria}
                  </span>
                  {a.se_puede_farmear === false && (
                    <span className="rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                      No se puede farmear después
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-indigo-200">{a.objetivo}</p>
                {a.consejo && <p className="mt-1 text-xs text-zinc-400">{a.consejo}</p>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {(plan.modos ?? []).length > 0 && (
        <SectionCard icon="🎮" title="Modos de juego" accent="border-l-teal-600">
          <ul className="space-y-2">
            {(plan.modos ?? []).map((grupo, i) => (
              <li
                key={`${grupo.modo}-${i}`}
                className="rounded border border-zinc-800 bg-zinc-900 p-2.5"
              >
                <p className="font-medium text-teal-300">{grupo.modo}</p>
                {grupo.trofeos_relacionados.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {grupo.trofeos_relacionados.map((id) => (
                      <TrophyChip key={id} trophies={trophies} trophyId={id} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {plan.orden_sugerido.length > 0 && (
        <SectionCard icon="📋" title="Orden sugerido" accent="border-l-zinc-500">
          <ol className="space-y-1.5">
            {plan.orden_sugerido.map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-right text-xs text-zinc-500">{i + 1}.</span>
                <TrophyChip trophies={trophies} trophyId={id} />
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      {plan.tips_generales.length > 0 && (
        <SectionCard icon="💡" title="Tips generales" accent="border-l-purple-600">
          <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-300">
            {plan.tips_generales.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </SectionCard>
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
  trophies: AdvisorTrophy[];
  cachedPlan: AiGamePlan | null;
}) {
  const [state, formAction, pending] = useActionState<AiPlanActionState, FormData>(
    generateAiPlan,
    initialAiPlanState,
  );

  const plan = state.plan ?? (state.error ? null : cachedPlan);
  const hasPlan = plan !== null;

  return (
    <section
      id="advisor"
      className="scroll-mt-20 space-y-3 rounded-lg border border-blue-900/40 bg-gradient-to-b from-blue-950/20 to-zinc-900 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold">
            <span aria-hidden="true">✨</span> Advisor con IA
          </h2>
          <p className="text-xs text-zinc-500">
            Contenido generado por IA: puede tener errores, verificá contra la guía oficial si el
            trofeo es importante. Clickeá un trofeo para ir a él en la lista y ver cómo
            desbloquearlo.
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
