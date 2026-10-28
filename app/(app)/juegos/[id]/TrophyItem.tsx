"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";
import { explainTrophy } from "./actions";
import { TrophyTypeIcon, type TrophyType } from "@/components/TrophyTypeIcon";
import { RARITY_CLASS, RARITY_LABEL } from "@/components/trophyRarity";

const TYPE_LABEL: Record<string, string> = {
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
  platinum: "Platino",
  // Steam: los logros son planos, no hay tipo que mostrar más allá de esto.
  achievement: "Logro",
};

export default function TrophyItem({
  gameId,
  trophyId,
  name,
  description,
  type,
  hidden,
  iconUrl,
  isObtained,
  rarity,
  earnedRate,
  progressTarget,
  focusToken,
  featured = false,
}: {
  gameId: string;
  trophyId: string;
  name: string;
  description: string | null;
  type: string;
  hidden: boolean;
  iconUrl: string | null;
  isObtained: boolean;
  rarity: number | null;
  earnedRate: number | null;
  progressTarget: string | null;
  /**
   * Cambia cada vez que el advisor pide enfocar ESTE trofeo (`null` si no es
   * el enfocado). Es un contador y no un booleano para que volver a clickear
   * el mismo trofeo scrollee de nuevo en vez de no cambiar nada.
   */
  focusToken: number | null;
  /** El platino, separado arriba de la lista: fila destacada con el metal. */
  featured?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const itemRef = useRef<HTMLLIElement>(null);
  const requestedRef = useRef(false);

  // Abrir la ayuda cuando llega el foco desde el advisor se resuelve durante el
  // render comparando contra el token ya visto, no con un setState dentro de un
  // useEffect (regla `react-hooks/set-state-in-effect`, ver CLAUDE.md). Arranca
  // en null y no en `focusToken`: cuando el foco llega por la URL (`?trofeo=`)
  // el ítem ya se monta con el token puesto, y eso también tiene que abrirla.
  const [seenFocusToken, setSeenFocusToken] = useState<number | null>(null);
  if (focusToken !== seenFocusToken) {
    setSeenFocusToken(focusToken);
    if (focusToken !== null) setOpen(true);
  }

  // El scroll sí va en un effect: es una acción sobre el DOM, no estado, y
  // tiene que correr después de que el ítem esté montado y visible.
  useEffect(() => {
    if (focusToken === null) return;
    itemRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusToken]);

  // La ayuda se pide una sola vez, la abra el usuario o el advisor.
  useEffect(() => {
    if (!open || requestedRef.current) return;
    requestedRef.current = true;

    const formData = new FormData();
    formData.set("gameId", gameId);
    formData.set("trophyId", trophyId);
    startTransition(async () => {
      const result = await explainTrophy({ hint: null, error: null }, formData);
      setHint(result.hint);
      setError(result.error);
    });
  }, [open, gameId, trophyId, startTransition]);

  return (
    /*
     * Fila con hairline, no tarjeta con borde (issue #176 §4): con 50 trofeos
     * en pantalla, 50 marcos de 1px compiten entre sí y ninguno gana. Lo que
     * distingue una fila de otra es el color del ícono de tipo, que es
     * justamente el dato que se busca de un vistazo.
     *
     * "Obtenido" tampoco es un fondo verde: es el ícono a plena opacidad más
     * el chip de `success`. El fondo teñido pintaba de color media lista en
     * cuanto el juego iba por la mitad.
     */
    <li
      ref={itemRef}
      id={`trofeo-${trophyId}`}
      data-featured={featured || undefined}
      className={`scroll-mt-20 border-b border-border px-1 py-3 transition-colors last:border-b-0 ${
        focusToken !== null
          ? "bg-accent/10 ring-1 ring-accent-ink"
          : featured
            ? "rounded-card border-b-0 bg-gradient-to-r from-platinum-glow via-surface to-surface px-3 shadow-[inset_3px_0_0_var(--trophy-platinum)]"
            : "hover:bg-surface"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {iconUrl ? (
            <GameArt
              src={iconUrl}
              alt=""
              width={featured ? 56 : 40}
              height={featured ? 56 : 40}
              className={`${featured ? "h-14 w-14" : "h-10 w-10"} shrink-0 rounded-chip object-cover ${
                isObtained ? "" : "grayscale opacity-60"
              }`}
              // El ícono es decorativo: sin él alcanza con el color del tipo.
              fallback={null}
            />
          ) : (
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-chip bg-surface ${
                isObtained ? "" : "grayscale opacity-60"
              }`}
            >
              <TrophyTypeIcon type={type as TrophyType} className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate type-subtitle text-ink">
              {name}
              {hidden && <span className="ml-2 type-caption text-ink-faint">(oculto)</span>}
              {isObtained && (
                <span className="ml-2 inline-flex items-center gap-0.5 type-caption font-medium text-success">
                  <Icon name="check" className="h-3 w-3" />
                  Obtenido
                </span>
              )}
            </p>
            {description && <p className="truncate type-meta text-ink-muted">{description}</p>}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 type-caption text-ink-faint">
              <span className="flex items-center gap-1">
                <TrophyTypeIcon type={type as TrophyType} className="h-3.5 w-3.5" />
                {TYPE_LABEL[type] ?? type}
              </span>
              {rarity !== null && rarity in RARITY_LABEL && (
                <span
                  className={`rounded-chip border px-1.5 py-0.5 font-medium ${RARITY_CLASS[rarity]}`}
                >
                  {RARITY_LABEL[rarity]}
                </span>
              )}
              {earnedRate !== null && <span>{earnedRate}% lo desbloqueó</span>}
              {progressTarget && <span>Objetivo: {progressTarget}</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-chip border border-border-strong px-3 py-2 type-caption font-medium text-ink-muted transition-colors hover:border-accent-ink hover:text-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 sm:w-auto sm:py-1.5"
        >
          {!open && <Icon name="help" className="h-3.5 w-3.5" />}
          {open ? "Ocultar ayuda" : "Cómo desbloquearlo"}
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-card border border-border bg-surface p-3 type-body">
          {pending && <p className="text-ink-muted">Generando ayuda...</p>}
          {!pending && error && <p className="text-danger">{error}</p>}
          {!pending && hint && <p className="text-ink">{hint}</p>}
        </div>
      )}
    </li>
  );
}
