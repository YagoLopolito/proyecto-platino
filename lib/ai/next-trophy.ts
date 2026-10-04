/**
 * Qué trofeo encarar ahora, a partir de un plan ya guardado. Módulo puro y sin
 * `import "server-only"` (misma razón que `plan-prompt.ts`): lo usa el panel
 * del advisor en el cliente y se testea directo desde el spec.
 *
 * La regla es de producto: **si queda algún perdible pendiente, el siguiente
 * trofeo es el primero de la run**, diga lo que diga `siguiente_trofeo`. Un
 * trofeo de historia o un coleccionable se consiguen igual más adelante; un
 * perdible, no. El prompt ya le pide al modelo esto mismo, pero el plan está
 * cacheado y los trofeos se siguen sincronizando: si el usuario ya sacó el
 * perdible que el modelo eligió, el siguiente tiene que pasar al próximo
 * perdible de la lista, no al primero de `orden_sugerido`.
 */

/** Lo mínimo del plan que hace falta (cualquier `AiGamePlan` lo cumple). */
export type NextTrophyPlan = {
  missables: { trofeo_id: string; motivo: string; momento_limite: string }[];
  orden_sugerido: string[];
  siguiente_trofeo: { trofeo_id: string; por_que: string; pasos?: string[] } | null;
};

export type NextTrophyCandidate = { id: string; obtained: boolean };

export type NextTrophy<T extends NextTrophyCandidate> = {
  trophy: T;
  porQue: string;
  pasos: string[];
  /** Si el trofeo es perdible, por qué y hasta cuándo se puede conseguir. */
  missable: { motivo: string; momentoLimite: string } | null;
};

/**
 * Los perdibles del plan que todavía no se obtuvieron, en el orden del plan
 * (el prompt pide que `missables` vaya en orden cronológico de la partida: el
 * primero es el que se pierde antes). Un id que no está en la lista de trofeos
 * se descarta: no hay nada que mostrar ni adónde linkear.
 */
export function pendingMissables<T extends NextTrophyCandidate>(
  plan: Pick<NextTrophyPlan, "missables">,
  trophies: T[],
): { trophy: T; motivo: string; momentoLimite: string }[] {
  const byId = new Map(trophies.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const result: { trophy: T; motivo: string; momentoLimite: string }[] = [];
  for (const m of plan.missables) {
    const trophy = byId.get(m.trofeo_id);
    if (!trophy || trophy.obtained || seen.has(trophy.id)) continue;
    seen.add(trophy.id);
    result.push({ trophy, motivo: m.motivo, momentoLimite: m.momento_limite });
  }
  return result;
}

export function resolveNextTrophy<T extends NextTrophyCandidate>(
  plan: NextTrophyPlan,
  trophies: T[],
): NextTrophy<T> | null {
  const byId = new Map(trophies.map((t) => [t.id, t]));
  const suggested = plan.siguiente_trofeo;

  const [firstMissable] = pendingMissables(plan, trophies);
  if (firstMissable) {
    const missable = {
      motivo: firstMissable.motivo,
      momentoLimite: firstMissable.momentoLimite,
    };
    // Si el modelo eligió ese mismo perdible, sus pasos valen; si eligió otro,
    // se descartan: serían los pasos de un trofeo distinto.
    if (suggested?.trofeo_id === firstMissable.trophy.id) {
      return {
        trophy: firstMissable.trophy,
        porQue: suggested.por_que,
        pasos: suggested.pasos ?? [],
        missable,
      };
    }
    return {
      trophy: firstMissable.trophy,
      porQue: "Es el primer trofeo perdible que te queda en la partida.",
      pasos: [],
      missable,
    };
  }

  if (suggested) {
    const trophy = byId.get(suggested.trofeo_id);
    if (trophy && !trophy.obtained) {
      return { trophy, porQue: suggested.por_que, pasos: suggested.pasos ?? [], missable: null };
    }
  }

  const fromOrder = plan.orden_sugerido
    .map((id) => byId.get(id))
    .find((t): t is T => t !== undefined && !t.obtained);
  const fallback = fromOrder ?? trophies.find((t) => !t.obtained);
  return fallback ? { trophy: fallback, porQue: "", pasos: [], missable: null } : null;
}
