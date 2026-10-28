"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_PLATINUM_PREFS,
  type PlatinumCelebrationItem,
  type PlatinumPrefs,
  type PlatinumState,
} from "@/lib/platinum/types";
import type { PlatinumPiece } from "@/lib/platinum/stats";

// Pesados y casi nunca en pantalla: se bajan recién cuando hay algo para
// mostrar, fuera del bundle inicial de todas las páginas.
const PlatinumCelebration = dynamic(() => import("./PlatinumCelebration"), { ssr: false });
const SharePlatinumDialog = dynamic(() => import("./SharePlatinumDialog"), { ssr: false });

/** Route handlers y no Server Actions: ver el comentario en `/api/platino/estado`. */
const STATE_ENDPOINT = "/api/platino/estado";
const CELEBRATED_ENDPOINT = "/api/platino/celebrado";
/** Copia local de las preferencias, para aplicarlas antes de que llegue la red. */
const PREFS_STORAGE_KEY = "platinoob:platinum-prefs";
/** Evento para pedir un chequeo de platinos nuevos (lo dispara el sync manual). */
const CHECK_EVENT = "platinoob:platinum-check";

export function requestPlatinumCheck(): void {
  window.dispatchEvent(new Event(CHECK_EVENT));
}

interface PlatinumContextValue {
  prefs: PlatinumPrefs;
  /** Ya se leyeron las preferencias del servidor (la lluvia de la ficha espera esto). */
  ready: boolean;
  /** Efectos de verdad: activados en Configuración y sin `prefers-reduced-motion`. */
  motion: boolean;
  setPrefs: (prefs: PlatinumPrefs) => void;
  openShare: (piece: PlatinumPiece) => void;
}

const PlatinumContext = createContext<PlatinumContextValue>({
  prefs: DEFAULT_PLATINUM_PREFS,
  ready: false,
  motion: false,
  setPrefs: () => undefined,
  openShare: () => undefined,
});

export function usePlatinum(): PlatinumContextValue {
  return useContext(PlatinumContext);
}

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readCachedPrefs(): PlatinumPrefs | null {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "sound" in parsed &&
      "effects" in parsed &&
      typeof parsed.sound === "boolean" &&
      typeof parsed.effects === "boolean"
    ) {
      return { sound: parsed.sound, effects: parsed.effects };
    }
  } catch {
    // Navegación privada o storage bloqueado: se espera a la red.
  }
  return null;
}

function isPlatinumState(value: unknown): value is PlatinumState {
  return (
    typeof value === "object" &&
    value !== null &&
    "prefs" in value &&
    "pending" in value &&
    Array.isArray(value.pending)
  );
}

/**
 * Estado del platino compartido por toda la app autenticada (montado en
 * `app/(app)/layout.tsx`):
 *
 * - las preferencias de efectos y sonido (Configuración › Perfil), que además
 *   se reflejan en `<html data-platinum-fx>` para que el CSS apague los
 *   reflejos sin JS en cada carátula;
 * - la cola de platinos nuevos sin celebrar, que se pide al abrir la app, al
 *   volver a primer plano y después de un sync manual;
 * - el diálogo de "Compartir en actividad", uno solo para la celebración, la
 *   ficha del juego y la vitrina.
 */
export function PlatinumProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<PlatinumPrefs>(DEFAULT_PLATINUM_PREFS);
  const [ready, setReady] = useState(false);
  // La cola y cuántos tenía al llegar (para el "1 de 3"), juntos para que no
  // puedan desincronizarse.
  const [celebrations, setCelebrations] = useState<{
    items: PlatinumCelebrationItem[];
    total: number;
  }>({ items: [], total: 0 });
  const [sharing, setSharing] = useState<PlatinumPiece | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );

  const applyPrefs = useCallback((next: PlatinumPrefs) => {
    setPrefsState(next);
    document.documentElement.dataset.platinumFx = next.effects ? "on" : "off";
    try {
      window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Sin storage: la próxima carga espera a la red, nada más.
    }
  }, []);

  // Pedidos al servidor y suscripciones a eventos del navegador: efecto
  // externo. Los setState pasan en los callbacks, no sincrónicamente.
  useEffect(() => {
    let cancelled = false;
    const cached = readCachedPrefs();
    if (cached) document.documentElement.dataset.platinumFx = cached.effects ? "on" : "off";

    const refresh = () => {
      void fetch(STATE_ENDPOINT, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: unknown) => {
          if (cancelled) return;
          // Sin estado válido (sesión vencida, error) quedan los defaults.
          if (!isPlatinumState(body)) {
            setReady(true);
            return;
          }
          applyPrefs(body.prefs);
          setReady(true);
          // Con una celebración en pantalla no se pisa la cola: el que se está
          // mostrando todavía puede figurar como pendiente en el servidor.
          setCelebrations((current) =>
            current.items.length > 0 || body.pending.length === 0
              ? current
              : { items: body.pending, total: body.pending.length },
          );
        })
        .catch(() => {
          // Es un adorno: sin red, la app sigue igual con los defaults.
          if (!cancelled) setReady(true);
        });
    };

    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(CHECK_EVENT, refresh);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CHECK_EVENT, refresh);
    };
  }, [applyPrefs]);

  const current = celebrations.items[0];

  const dismissCurrent = useCallback(() => {
    if (current) {
      void fetch(CELEBRATED_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userTrophyId: current.userTrophyId }),
      }).catch(() => undefined);
    }
    setCelebrations((state) => {
      const rest = state.items.slice(1);
      return { items: rest, total: rest.length === 0 ? 0 : state.total };
    });
  }, [current]);

  const value = useMemo<PlatinumContextValue>(
    () => ({
      prefs,
      ready,
      motion: prefs.effects && !reducedMotion,
      setPrefs: applyPrefs,
      openShare: setSharing,
    }),
    [prefs, ready, reducedMotion, applyPrefs],
  );

  return (
    <PlatinumContext.Provider value={value}>
      {children}
      {current && (
        <PlatinumCelebration
          key={current.userTrophyId}
          item={current}
          position={celebrations.total - celebrations.items.length + 1}
          total={celebrations.total}
          motion={value.motion}
          sound={prefs.sound}
          onClose={dismissCurrent}
          onShare={() => {
            dismissCurrent();
            setSharing(current);
          }}
        />
      )}
      {sharing && <SharePlatinumDialog piece={sharing} onClose={() => setSharing(null)} />}
    </PlatinumContext.Provider>
  );
}
