"use client";

import { useActionState, type ReactNode } from "react";
import { generateAiPlan, type AiPlanActionState } from "./ai-actions";
import { TrophyTypeIcon, type TrophyType, trophyTypeLabel } from "@/components/TrophyTypeIcon";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trophyFocusHref } from "./focusTrophy";
import { Icon, type IconName } from "@/components/ui/Icon";
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

/**
 * Link a un trofeo en la tab Trofeos, con la ayuda de "cómo desbloquearlo" ya
 * abierta (ver `focusTrophy.ts`). El id del juego sale de la ruta: el advisor
 * siempre vive dentro de `/juegos/[id]`.
 */
function useTrophyHref() {
  const { id: gameId } = useParams<{ id: string }>();
  return (trophyId: string) => trophyFocusHref(gameId, trophyId);
}

/** Chip de trofeo: nombre + tipo, tachado/atenuado si ya se obtuvo, con la
 * descripción como tooltip nativo al hacer hover. Al clickearlo lleva al
 * trofeo en la tab Trofeos y le abre la ayuda de "cómo desbloquearlo". */
function TrophyChip({ trophies, trophyId }: { trophies: AdvisorTrophy[]; trophyId: string }) {
  const trophyHref = useTrophyHref();
  const trophy = findTrophy(trophies, trophyId);
  if (!trophy) {
    return <span className="type-caption text-ink-muted">{trophyId}</span>;
  }

  return (
    <Link
      href={trophyHref(trophy.id)}
      title={`${trophy.description ?? "Sin descripción cargada."}

Clic para ver cómo desbloquearlo.`}
      className={`inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 text-left type-caption transition-colors hover:border-accent-ink hover:text-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 ${
        trophy.obtained
          ? "border-success/40 bg-success/10 text-success line-through decoration-success/60"
          : "border-border-strong bg-background text-ink"
      }`}
    >
      <TrophyTypeIcon type={trophy.type} className="h-3 w-3 shrink-0" />
      {trophy.name}
      <span className="text-ink-faint">({trophyTypeLabel(trophy.type)})</span>
      {trophy.obtained && <Icon name="check" className="h-3 w-3 shrink-0" />}
    </Link>
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
  const trophyHref = useTrophyHref();
  const next = resolveNextTrophy(plan, trophies);

  if (!next) {
    return (
      <div className="flex items-center gap-2 rounded-card border border-success/40 bg-success/10 p-3 type-body text-success">
        <Icon name="completed" className="h-4 w-4 shrink-0" />
        No te queda ningún trofeo pendiente en este juego.
      </div>
    );
  }

  return (
    <div className="rounded-card border border-success/40 bg-success/10 p-3">
      <h4 className="mb-2 flex items-center gap-1.5 type-overline text-success">
        <Icon name="trophy" className="h-3.5 w-3.5" />
        Siguiente trofeo
      </h4>
      <Link
        href={trophyHref(next.trophy.id)}
        className="flex w-full items-center gap-2 rounded-chip border border-success/40 bg-background p-2 text-left transition-colors hover:border-success focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
      >
        <TrophyTypeIcon type={next.trophy.type} className="h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <span className="block type-subtitle text-ink">{next.trophy.name}</span>
          <span className="block type-caption text-ink-muted">
            {next.trophy.description ?? "Sin descripción cargada."}
          </span>
        </span>
      </Link>
      {next.porQue && <p className="mt-2 type-caption text-success">{next.porQue}</p>}
      {next.pasos.length > 0 ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 type-caption text-ink">
          {next.pasos.map((paso, i) => (
            <li key={i}>{paso}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 type-caption text-ink-faint">
          Clickeá el trofeo para ver cómo desbloquearlo.
        </p>
      )}
    </div>
  );
}

/**
 * Tono de una sección del plan. El sistema tiene una paleta corta a propósito
 * (issue #176 §3.1): antes cada sección traía su propio color de Tailwind
 * (azul, ámbar, rojo, índigo, teal, púrpura) y el panel se leía como un
 * semáforo. Ahora `warning` y `danger` se reservan para lo que de verdad
 * cuesta trofeos -- perdibles y desafíos de dificultad -- y el resto es
 * informativo.
 */
const SECTION_TONE = {
  accent: { bar: "border-l-accent", ink: "text-accent-ink" },
  warning: { bar: "border-l-warning", ink: "text-warning" },
  danger: { bar: "border-l-danger", ink: "text-danger" },
  neutral: { bar: "border-l-border-strong", ink: "text-ink-faint" },
} as const;

function SectionCard({
  icon,
  title,
  tone,
  children,
}: {
  icon: IconName;
  title: string;
  tone: keyof typeof SECTION_TONE;
  children: ReactNode;
}) {
  // El tono pinta la barra lateral y el encabezado, no el contenedor: puesto
  // en el `div`, el color se filtraba a todo el texto de adentro que no
  // declarara el suyo.
  const { bar, ink } = SECTION_TONE[tone];

  return (
    <div className={`rounded-card border border-border border-l-4 bg-background p-3 ${bar}`}>
      <h4 className={`mb-2 flex items-center gap-1.5 type-overline ${ink}`}>
        <Icon name={icon} className="h-3.5 w-3.5" />
        {title}
      </h4>
      {children}
    </div>
  );
}

function PlanView({ plan, trophies }: { plan: AiGamePlan; trophies: AdvisorTrophy[] }) {
  const pendingCount = trophies.filter((t) => !t.obtained).length;

  return (
    <div className="space-y-4">
      <p className="type-body text-ink">{plan.resumen}</p>

      <NextTrophyCard plan={plan} trophies={trophies} />

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3">
        <Icon
          name={plan.puede_platinar_en_una_run ? "trophy" : "repeat"}
          className="h-5 w-5 shrink-0 text-accent-ink"
        />
        <div className="min-w-0 flex-1">
          <p className="type-subtitle text-ink">
            {plan.puede_platinar_en_una_run
              ? "Se puede platinar en una sola partida"
              : "Necesita más de una partida"}
          </p>
          {plan.notas_run_unica && (
            <p className="mt-0.5 type-caption text-ink-muted">{plan.notas_run_unica}</p>
          )}
        </div>
        {pendingCount > 0 && (
          <span className="shrink-0 rounded-chip border border-border-strong px-2 py-0.5 type-caption text-ink-muted">
            Te faltan {pendingCount}
          </span>
        )}
      </div>

      {plan.grupos_de_partidas.length > 0 && (
        <SectionCard icon="gamepad" title="Grupos de partidas" tone="accent">
          <ul className="space-y-2">
            {plan.grupos_de_partidas.map((grupo) => (
              <li key={grupo.run} className="rounded-chip border border-border bg-surface p-2.5">
                <p className="type-subtitle text-ink">Run {grupo.run}</p>
                <p className="type-caption text-ink-muted">{grupo.objetivo}</p>
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
        <SectionCard icon="alert" title="Trofeos perdibles (missables)" tone="warning">
          <ul className="space-y-2">
            {plan.missables.map((m, i) => (
              <li
                key={`${m.trofeo_id}-${i}`}
                className="rounded-chip border border-warning/30 bg-warning/5 p-2.5"
              >
                <div className="mb-1">
                  <TrophyChip trophies={trophies} trophyId={m.trofeo_id} />
                </div>
                <p className="type-caption text-ink-muted">{m.motivo}</p>
                {m.momento_limite && (
                  <p className="mt-1 type-caption text-warning">Límite: {m.momento_limite}</p>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {(plan.desafios_de_dificultad ?? []).length > 0 && (
        <SectionCard icon="flame" title="Trofeos de dificultad" tone="danger">
          <ul className="space-y-2">
            {(plan.desafios_de_dificultad ?? []).map((d, i) => (
              <li
                key={`${d.trofeo_id}-${i}`}
                className="rounded-chip border border-danger/30 bg-danger/5 p-2.5"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <TrophyChip trophies={trophies} trophyId={d.trofeo_id} />
                  <span className="rounded-chip border border-danger/40 bg-danger/10 px-2 py-0.5 type-overline text-danger">
                    {CHALLENGE_LABELS[d.categoria] ?? d.categoria}
                  </span>
                </div>
                <p className="type-caption text-ink-muted">{d.motivo}</p>
                {d.consejo && <p className="mt-1 type-caption text-danger">{d.consejo}</p>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {(plan.acumulables ?? []).length > 0 && (
        <SectionCard icon="target" title="Contadores a tener en cuenta" tone="accent">
          <p className="mb-2 type-caption text-ink-faint">
            Trofeos que piden acumular una cantidad. Conviene saberlos antes de empezar la historia:
            no son difíciles, pero se llega al final con el contador a medias.
          </p>
          <ul className="space-y-2">
            {(plan.acumulables ?? []).map((a, i) => (
              <li
                key={`${a.trofeo_id}-${i}`}
                className="rounded-chip border border-border bg-surface p-2.5"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <TrophyChip trophies={trophies} trophyId={a.trofeo_id} />
                  <span className="rounded-chip border border-accent-ink/40 bg-accent/15 px-2 py-0.5 type-overline text-accent-ink">
                    {COUNTER_LABELS[a.categoria] ?? a.categoria}
                  </span>
                  {a.se_puede_farmear === false && (
                    <span className="rounded-chip border border-warning/40 bg-warning/10 px-2 py-0.5 type-overline text-warning">
                      No se puede farmear después
                    </span>
                  )}
                </div>
                <p className="type-caption font-medium text-ink">{a.objetivo}</p>
                {a.consejo && <p className="mt-1 type-caption text-ink-muted">{a.consejo}</p>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {(plan.modos ?? []).length > 0 && (
        <SectionCard icon="monitor" title="Modos de juego" tone="accent">
          <ul className="space-y-2">
            {(plan.modos ?? []).map((grupo, i) => (
              <li
                key={`${grupo.modo}-${i}`}
                className="rounded-chip border border-border bg-surface p-2.5"
              >
                <p className="type-subtitle text-ink">{grupo.modo}</p>
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
        <SectionCard icon="list" title="Orden sugerido" tone="neutral">
          <ol className="space-y-1.5">
            {plan.orden_sugerido.map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-right type-caption tabular-nums text-ink-faint">
                  {i + 1}.
                </span>
                <TrophyChip trophies={trophies} trophyId={id} />
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      {plan.tips_generales.length > 0 && (
        <SectionCard icon="bulb" title="Tips generales" tone="neutral">
          <ul className="list-disc space-y-1 pl-4 type-caption text-ink">
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
      className="scroll-mt-20 space-y-3 rounded-card border border-border bg-gradient-to-b from-accent/10 to-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 type-title text-ink">
            <Icon name="sparkle" className="h-4 w-4 text-accent-ink" />
            Advisor con IA
          </h2>
          <p className="type-caption text-ink-muted">
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
            className="min-h-11 shrink-0 rounded-chip border border-accent-ink bg-accent/15 px-3 type-meta font-medium text-accent-ink transition-colors hover:bg-accent/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 disabled:opacity-50 sm:min-h-9"
          >
            {pending ? "Generando..." : hasPlan ? "Regenerar plan" : "Generar plan"}
          </button>
        </form>
      </div>

      {state.error && (
        <p role="alert" className="type-body text-danger">
          {state.error}
        </p>
      )}

      {!hasPlan && !state.error && !pending && (
        <p className="rounded-card border border-dashed border-border p-6 text-center type-body text-ink-muted">
          Todavía no se generó un plan para este juego.
        </p>
      )}

      {plan && <PlanView plan={plan} trophies={trophies} />}
    </section>
  );
}
